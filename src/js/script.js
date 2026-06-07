/* ============================================================
   STOIC PLAY — script.js
   Unified script (replaces script-mobile.js, script-tablet.js,
   script-laptop-and-up.js).

   Structure:
     1. State object (v)
     2. UI builder helpers
     3. Utility functions
     4. Data fetch
     5. Core playback  (update_ui_for, next, previous)
     6. Player events  (timeupdate, ended, loadedmetadata)
     7. Control events (play, pause, next, prev)
     8. Navigation events (home, search)
     9. Progress bar events
    10. Lyrics — parser integration (setLyrics)
    11. Lyrics — render loop   (renderLyrics)
    12. Lyrics — user interaction events
    13. Lyrics — toggle (lyrics button)
    14. Boot
   ============================================================ */


/*
=============================================================
DECRYPTION LOGIC
=============================================================
*/
function decryptToken(token) {
  const key = "JVUDYQSVIPSSXMZLJCRDNESMQTSNIKXIKZFKNCNVYVCUHEWGVK";

  // 1. Decode base64 string to a binary string
  const binaryString = atob(token);

  // 2. Convert binary string to a Uint8Array (bytes)
  const encryptedBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    encryptedBytes[i] = binaryString.charCodeAt(i);
  }

  // 3. Encode the key string into bytes
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);

  // 4. Reverse the XOR operation
  const decryptedBytes = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decryptedBytes[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  // 5. Decode the bytes back into a UTF-8 string
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(decryptedBytes);

  // 6. Parse and return the final JS object
  return JSON.parse(jsonStr);
}

/* ────────────────────────────────────────────────────────────
   1. STATE OBJECT
   All mutable app state lives here — keeps globals tidy.
   ──────────────────────────────────────────────────────────── */
const v = {
  /* DOM refs */
  main_container:         document.getElementById("main_container"),
  music_section:          document.getElementById("main_music_section"),
  search_container:       document.getElementById("search_container"),
  search_box:             document.getElementById("search_box"),
  search_music_container: document.getElementById("search_music_container"),
  player:                 document.getElementById("audio"),
  progress:               document.getElementById("prog_show"),
  progress_wide:          document.getElementById("prog_show_wide"),
  popup:                  document.getElementById("media_player_popup"),
  cprogress:              document.getElementById("progress_whole"),
  cprogress_wide:         document.getElementById("progress_whole_wide"),
  play:                   document.getElementById("play"),
  pause:                  document.getElementById("pause"),
  next:                   document.getElementById("next"),
  previous:               document.getElementById("prev"),
  home:                   document.getElementById("home_button"),
  search:                 document.getElementById("search_button"),
  lyrics_button:          document.getElementById("lyrics_button"),           /* mobile */
  lyrics_button_desktop:  document.getElementById("lyrics_button_desktop"),   /* tablet+ */
  main_lyrics_container:  document.getElementById("main_lyrics_container"),
  lyrics_container:       document.getElementById("lyrics_container"),
  media_player_popup:     document.getElementById("media_player_popup"),
  popup_loader:           document.getElementById("popup_loader"),

  /* App state */
  datas:             [],      /* raw JSON from data.json */
  appState:          true,
  allPlayBut:        [],
  current_section_id: null,

  /* Lyrics state */
  is_lrc_mode:       false,
  current_LRC:       null,
  all_lines:         null,
  is_user_scrolling: false,
  scroll_timeout:    null,
};

/* Detect whether we're in "laptop" layout (sidebar present) */
const isLaptop = () => window.innerWidth >= 1024;


/* ────────────────────────────────────────────────────────────
   2. UI BUILDER HELPERS
   ──────────────────────────────────────────────────────────── */
const ui = {
  /**
   * Build a single music card <section> element.
   * @param {string}  link      – base64-encoded audio src
   * @param {string}  lrcLink   – base64-encoded LRC src
   * @param {string}  img_path  – cover art URL
   * @param {string}  artist
   * @param {string}  title
   * @param {boolean} active    – whether a track is currently playing
   */
  builderHelper(link, lrcLink, img_path, artist, title, active) {
    const sec = document.createElement("section");
    sec.className = "music_section_block";
    sec.id = link;
    sec.setAttribute("lyrics-set", lrcLink);

    /* Image container + overlay buttons */
    const img_cont = document.createElement("div");
    img_cont.className = "image_container";
    if (active && v.current_section_id === link) {
      img_cont.className += " active";
    }

    const img_top = document.createElement("div");
    img_top.className = "image_top";
    const itp = document.createElement("p");
    itp.className = "img_top_play";
    itp.textContent = "▶";
    const itd = document.createElement("p");
    itd.className = "img_top_dots";
    itd.innerHTML = "&middot;&middot;&middot;";
    img_top.append(itp, itd);
    img_cont.append(img_top);

    /* Cover art image */
    const img = document.createElement("img");
    img.setAttribute("loading", "lazy");
    img.className = "cover_art";
    img.alt = title;
    img.src = img_path;
    img.crossOrigin = "Anonymous";
    img_cont.append(img);

    /* Title + artist */
    const tt  = document.createElement("p");
    tt.className = "title";
    tt.textContent = title;

    const art = document.createElement("p");
    art.className = "artist";
    art.textContent = artist;

    sec.append(img_cont, tt, art);
    return sec;
  },

  /** Rebuild the home music grid from v.datas */
  builder() {
    v.music_section.innerHTML = "";
    v.datas.forEach((data) => {
      try {
        const artist   = data["artist"];
        const title    = data["title"];
        const image    = data["covert_art"];
        const link     = btoa(data["wav"]);
        const lrcLink  = btoa(data["lrc"]);
        const active   = Boolean(v.current_section_id);
        const sec = ui.builderHelper(link, lrcLink, image, artist, title, active);
        v.music_section.append(sec);
      } catch (e) {
        console.error(e);
      }
    });
  },

  /** Filter and display search results */
  search(val) {
    v.search_music_container.innerHTML = "";
    if (!val) return;

    const query = val.toLowerCase();
    v.datas.forEach((data) => {
      try {
        const artist  = data["artist"];
        const title   = data["title"];
        if (
          artist.toLowerCase().includes(query) ||
          title.toLowerCase().includes(query)
        ) {
          const image   = data["covert_art"];
          const link    = btoa(data["wav"]);
          const lrcLink = btoa(data["lrc"]);
          const active  = Boolean(v.current_section_id);
          const sec = ui.builderHelper(link, lrcLink, image, artist, title, active);
          v.search_music_container.append(sec);
        }
      } catch (e) {
        console.error(e);
      }
    });
  },
};


/* ────────────────────────────────────────────────────────────
   3. UTILITY FUNCTIONS
   ──────────────────────────────────────────────────────────── */

/** Format seconds as MM:SS */
function secondsToMMSS(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Sync both progress bars (inline mobile + wide tablet/laptop).
 * Centralising this avoids duplicated logic in the timeupdate handler.
 */
function setProgress(percentage) {
  if (v.progress)      v.progress.style.width      = `${percentage}%`;
  if (v.progress_wide) v.progress_wide.style.width = `${percentage}%`;
}

/**
 * Seek to a position based on a click event on a progress bar element.
 * @param {MouseEvent} e
 * @param {HTMLElement} bar – the clickable track element
 */
function seekFromClick(e, bar) {
  const rect       = bar.getBoundingClientRect();
  const offsetX    = e.clientX - rect.left;
  const percentage = offsetX / rect.width;
  v.player.currentTime = v.player.duration * percentage;
}

/**
 * Promise that resolves when a card is both visible on screen
 * and its cover art image has fully loaded.
 */
function waitForReady(target) {
  return new Promise((resolve) => {
    target.scrollIntoView({ behavior: "smooth", block: "end" });

    const check = () => {
      const rect      = target.getBoundingClientRect();
      const coverArt  = target.querySelector(".cover_art");
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      const imgReady  = coverArt?.complete && coverArt?.naturalWidth > 0;
      isVisible && imgReady ? resolve() : requestAnimationFrame(check);
    };

    setTimeout(check, 100);
  });
}


/* ────────────────────────────────────────────────────────────
   4. DATA FETCH
   ──────────────────────────────────────────────────────────── */
async function jsonFetch(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.error("Could not fetch the necessary data!");
      v.appState = false;
      return;
    }
    const encodedData = await res.text();
    v.datas     = decryptToken(encodedData);
    ui.builder();
    v.allPlayBut = document.querySelectorAll(".music_section_block");
  } catch (e) {
    console.error(e);
  }
}


/* ────────────────────────────────────────────────────────────
   5. CORE PLAYBACK
   ──────────────────────────────────────────────────────────── */

/**
 * Load and play the track associated with `section`,
 * update cover art, color palette, and fetch LRC lyrics.
 */
async function update_ui_for(section) {
  /* Remove active state from all image containers */
  document.querySelectorAll(".image_container").forEach((el) => {
    el.className = "image_container";
  });

  const music_src = String(atob(section.id));
  const img       = section.querySelector(".cover_art");
  section.querySelector(".image_container").className += " active";

  /* ── Load & play audio ── */
  try {
    v.player.src         = music_src;
    v.player.crossOrigin = "Anonymous";
    v.player.load();
    v.player.play();
  } catch (e) {
    console.error(e.message);
    return;
  }

  /* ── Fetch & parse LRC ── */
  try {
    const b64lrcLink = section.getAttribute("lyrics-set");
    const lrcLink    = atob(b64lrcLink);
    const res        = await fetch(lrcLink);
    const rawLrc     = await res.text();
    setLyrics(rawLrc);
  } catch (e) {
    console.error(e.message);
  }

  /* ── Dynamic colour palette via ColorThief ── */
  const colorThief = new ColorThief();
  const palette    = colorThief.getPalette(img, 3);
  const rgb        = palette.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);
  const root       = document.documentElement;
  root.style.setProperty("--color-1", rgb[0]);
  root.style.setProperty("--color-2", rgb[1]);
  root.style.setProperty("--color-3", rgb[2]);

  /* ── Update popup UI ── */
  v.popup.querySelector("#cvr_popup").src           = img.src;
  v.popup.querySelector("#title_popup").textContent  = img.alt;
  v.popup.querySelector("#artist_popup").textContent =
    section.querySelector(".artist").textContent;

  /* ── Cache lyric lines for renderLyrics ── */
  v.all_lines = v.lyrics_container.querySelectorAll("section");

  /* Restart render loop if lyrics view is active */
  if (v.is_lrc_mode) requestAnimationFrame(renderLyrics);
}

/** Advance to the next track (wraps around) */
async function next() {
  const all = [...document.querySelectorAll(".music_section_block")];
  const idx = all.findIndex((c) =>
    c.querySelector(".image_container")?.classList.contains("active")
  );
  if (idx === -1) return;

  all[idx].querySelector(".image_container").className = "image_container";

  const nextIdx = (idx + 1) % all.length;
  const target  = all[nextIdx];
  target.scrollIntoView({ behavior: "smooth", block: "end" });
  await update_ui_for(target);
  v.current_section_id = target.id;
}

/** Go back to the previous track (wraps around) */
async function previous() {
  const all = [...document.querySelectorAll(".music_section_block")];
  const idx = all.findIndex((c) =>
    c.querySelector(".image_container")?.classList.contains("active")
  );
  if (idx === -1) return;

  all[idx].querySelector(".image_container").classList.remove("active");

  const prevIdx = idx - 1 >= 0 ? idx - 1 : all.length - 1;
  const target  = all[prevIdx];

  await waitForReady(target);
  await update_ui_for(target);
  v.current_section_id = target.id;
}


/* ────────────────────────────────────────────────────────────
   6. PLAYER EVENTS
   ──────────────────────────────────────────────────────────── */

/* ── Loader helpers ── */
const showLoader = () => v.popup_loader.classList.add("visible");
const hideLoader = () => v.popup_loader.classList.remove("visible");

/* Show while buffering / seeking / initial load */
v.player.addEventListener("loadstart",  showLoader);
v.player.addEventListener("waiting",    showLoader);
v.player.addEventListener("seeking",    showLoader);

/* Hide once ready to play */
v.player.addEventListener("playing",    hideLoader);
v.player.addEventListener("canplay",    hideLoader);
v.player.addEventListener("error",      hideLoader);

v.player.addEventListener("timeupdate", () => {
  const ct         = v.player.currentTime;
  const total      = v.player.duration;
  const percentage = (ct / total) * 100;
  setProgress(percentage);
  const formatted = secondsToMMSS(ct);
  document.getElementById("curr_time").textContent      = formatted;
  document.getElementById("curr_time_wide").textContent = formatted;
});

v.player.addEventListener("ended", () => next());

v.player.addEventListener("loadedmetadata", () => {
  const formatted = secondsToMMSS(v.player.duration);
  document.getElementById("total_duration").textContent      = formatted;
  document.getElementById("total_duration_wide").textContent = formatted;
  v.play.style.display  = "none";
  v.pause.style.display = "block";
});


/* ────────────────────────────────────────────────────────────
   7. CONTROL EVENTS  (play / pause / next / prev)
   ──────────────────────────────────────────────────────────── */

v.play.addEventListener("click", () => {
  if (v.player.readyState === 0) return;
  v.player.play();
  v.pause.style.display = "block";
  v.play.style.display  = "none";
  document.querySelector(".image_container.active")
    ?.style.setProperty("--var-1", "rotate");
});

v.pause.addEventListener("click", () => {
  if (v.player.readyState === 0) return;
  v.player.pause();
  v.pause.style.display = "none";
  v.play.style.display  = "block";
  document.querySelector(".image_container.active")
    ?.style.setProperty("--var-1", "paused");
});

v.next.addEventListener("click", async () => {
  if (v.player.readyState === 0) return;
  await next();
});

v.previous.addEventListener("click", async () => {
  if (v.player.readyState === 0) return;
  await previous();
});


/* ────────────────────────────────────────────────────────────
   8. NAVIGATION EVENTS  (home / search)
   ──────────────────────────────────────────────────────────── */

v.home.addEventListener("click", () => {
  ui.builder();
  v.music_section.style.display    = "flex";
  v.search_container.style.display = "none";
  v.home.className   = "active_menu";
  v.search.className = "";
});

v.search.addEventListener("click", () => {
  v.music_section.style.display    = "none";
  v.search_container.style.display = "flex";
  v.search.className  = "active_menu";
  v.home.className    = "";
});

/* Click on a card in the main grid */
v.music_section.addEventListener("click", async (e) => {
  const section = e.target.closest("section");
  if (!section) return;
  await update_ui_for(section);
  v.current_section_id = section.id;
});

/* Click on a card in search results */
v.search_container.addEventListener("click", async (e) => {
  const section = e.target.closest("section");
  if (!section) return;
  await update_ui_for(section);
  v.current_section_id = section.id;
});

/* Search — trigger on Enter key */
v.search_box.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    ui.search(v.search_box.value);
  }
});


/* ────────────────────────────────────────────────────────────
   9. PROGRESS BAR EVENTS  (seek on click — both bars)
   ──────────────────────────────────────────────────────────── */

v.cprogress.addEventListener("click", (e) => seekFromClick(e, v.cprogress));

/* Wide progress bar (tablet / laptop) */
if (v.cprogress_wide) {
  v.cprogress_wide.addEventListener("click", (e) => seekFromClick(e, v.cprogress_wide));
}


/* ────────────────────────────────────────────────────────────
   10. LYRICS — PARSER INTEGRATION
   ──────────────────────────────────────────────────────────── */

/** Create a single syllable <span> for the lyrics container */
function give_lrc_block(text, time) {
  const span = document.createElement("span");
  span.setAttribute("time", time);
  span.className = "inactive_lrc";
  span.textContent = text;
  return span;
}

/**
 * Parse raw LRC string via StoicMess, build the DOM, and cache line refs.
 * @param {string} raw – raw .lrc file content
 */
function setLyrics(raw) {
  if (raw.length < 10) return;

  const stoic = new StoicMess();
  if (!stoic.loadLrcString(raw)) return;

  v.current_LRC = stoic;
  const lines   = stoic.getAllLines();

  v.lyrics_container.innerHTML = "";

  lines.forEach((line) => {
    const sec = document.createElement("section");
    sec.className = "inactive_line";
    sec.setAttribute("isEnhanced", line["isEnhanced"]);
    sec.setAttribute("time", line["lineStart"]);

    line["syllables"].forEach((syl) => {
      sec.append(give_lrc_block(syl["text"], syl["time"]));
    });

    v.lyrics_container.append(sec);
  });

  /* Cache freshly built lines */
  v.all_lines = v.lyrics_container.querySelectorAll("section");

  /* If lyric view is visible, kick off the render loop */
  if (v.is_lrc_mode) requestAnimationFrame(renderLyrics);
}


/* ────────────────────────────────────────────────────────────
   11. LYRICS — RENDER LOOP  (requestAnimationFrame)
   ──────────────────────────────────────────────────────────── */
function renderLyrics() {
  /* Bail if user is manually scrolling */
  if (v.is_user_scrolling) return;

  v.all_lines?.forEach((line) => {
    const lineTime   = Number(line.getAttribute("time"));
    const isEnhanced = line.getAttribute("isEnhanced") === "true";
    let   run_if     = false;

    if (isEnhanced) {
      /* Enhanced (word-timed): active while within last syllable's timestamp */
      const syls       = line.querySelectorAll("span");
      const lastSyl    = syls[syls.length - 1];
      const lastSylTime = Number(lastSyl.getAttribute("time"));
      run_if = v.player.currentTime >= lineTime && lastSylTime >= v.player.currentTime;
    } else {
      /* Standard: active until the next line starts */
      const nextLine = line.nextElementSibling;
      const nextTime = nextLine ? Number(nextLine.getAttribute("time")) : 99999;
      run_if = v.player.currentTime >= lineTime && nextTime >= v.player.currentTime;
    }

    if (run_if) {
      line.className = "active_line";

      /* Auto-scroll active line into centre if out of view */
      const rect = line.getBoundingClientRect();
      if (!(rect.top >= 0 && rect.bottom <= window.innerHeight / 2)) {
        line.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      /* Colour individual syllables */
      line.querySelectorAll("span").forEach((syl) => {
        syl.className = Number(syl.getAttribute("time")) <= v.player.currentTime
          ? "active_lrc"
          : "inactive_lrc";
      });
    } else {
      line.className = "inactive_line";
      line.querySelectorAll(".active_lrc").forEach((syl) => {
        syl.className = "inactive_lrc";
      });
    }
  });

  requestAnimationFrame(renderLyrics);
}


/* ────────────────────────────────────────────────────────────
   12. LYRICS — USER INTERACTION EVENTS
   ──────────────────────────────────────────────────────────── */

/* Click a lyric line → seek to that time */
v.lyrics_container.addEventListener("click", (e) => {
  const span = e.target.closest("span");
  if (!span) return;
  v.player.currentTime = Number(span.getAttribute("time"));
});

/* Wheel scroll → pause auto-scroll for 3 s, show hover state */
v.lyrics_container.addEventListener("wheel", () => {
  v.is_user_scrolling = true;
  clearTimeout(v.scroll_timeout);

  v.all_lines?.forEach((l) => (l.className = "inactive_line_hover"));

  v.scroll_timeout = setTimeout(() => {
    v.all_lines?.forEach((l) => (l.className = "inactive_line"));
    v.is_user_scrolling = false;
    requestAnimationFrame(renderLyrics);
  }, 3000);
});


/* ────────────────────────────────────────────────────────────
   13. LYRICS TOGGLE  (microphone icon button)
   Shared handler used by both mobile (#lyrics_button) and
   tablet/desktop (#lyrics_button_desktop).
   ──────────────────────────────────────────────────────────── */
function toggleLyricsView() {
  const micIcon_mobile  = v.lyrics_button?.querySelector(".fa-microphone-lines");
  const micIcon_desktop = v.lyrics_button_desktop?.querySelector(".fa-microphone-lines");

  if (v.is_lrc_mode) {
    /* ── Leaving lyrics view ── */
    if (micIcon_mobile)  micIcon_mobile.style.color  = "rgb(255, 255, 255)";
    if (micIcon_desktop) micIcon_desktop.style.color = "rgb(255, 255, 255)";

    v.main_container.style.display          = isLaptop() ? "grid" : "flex";
    v.main_lyrics_container.style.display   = "none";
    v.media_player_popup.classList.remove("lrc_mode");

    /* Restore sidebar offset on laptop */
    if (isLaptop()) v.media_player_popup.style.marginLeft = "300px";

    v.is_lrc_mode = false;
    v.main_container.scrollIntoView({ block: "center" });
    return;
  }

  /* ── Entering lyrics view ── */
  if (micIcon_mobile)  micIcon_mobile.style.color  = "rgb(183, 0, 255)";
  if (micIcon_desktop) micIcon_desktop.style.color = "rgb(183, 0, 255)";

  v.main_container.style.display          = "none";
  v.main_lyrics_container.style.display   = "flex";
  v.media_player_popup.classList.add("lrc_mode");

  if (isLaptop()) v.media_player_popup.style.marginLeft = "0px";

  v.is_lrc_mode = true;
  v.all_lines   = v.lyrics_container.querySelectorAll("section");
  requestAnimationFrame(renderLyrics);
}

/* Attach to both buttons */
v.lyrics_button?.addEventListener("click", toggleLyricsView);
v.lyrics_button_desktop?.addEventListener("click", toggleLyricsView);


/* ────────────────────────────────────────────────────────────
   14. BOOT
   ──────────────────────────────────────────────────────────── */
jsonFetch("./src/json/data.enc");
