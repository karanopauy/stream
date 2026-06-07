class StoicMess {
  constructor() {
    this._lrc = [];
    this._lineTimestamps = [];
    this._lrcRaw = [];
  }

  loadLrcString(content) {
    try {
      this._lrcRaw = content.split("\n");
      this._parseLrc();
      return true;
    } catch (e) {
      console.error(`[Engine Error] ${e}`);
      return false;
    }
  }

  _toSeconds(timestamp) {
    try {
      const [m, s] = timestamp.split(":");
      return parseFloat(m) * 60 + parseFloat(s);
    } catch {
      return 0.0;
    }
  }

  _parseLrc() {
    const linePattern = /^\[(\d{2}:\d{2}\.\d{2})\](.*)/;
    const sylPattern = /<(\d{2}:\d{2}\.\d{2})>([^<]*)/g;
    const tempParsed = [];

    for (const rawLine of this._lrcRaw) {
      const match = rawLine.trim().match(linePattern);
      if (!match) continue;

      const startSec = this._toSeconds(match[1]);
      const content = match[2];
      const sylMatches = [...content.matchAll(sylPattern)];

      let syllables = [];
      let fullText = "";

      if (sylMatches.length > 0) {
        syllables = sylMatches.map((m) => ({
          time: this._toSeconds(m[1]),
          text: m[2],
        }));
        fullText = syllables
          .map((s) => s.text)
          .join("")
          .trim();
      } else {
        fullText = content.trim();
        syllables = [{ time: startSec, text: fullText }];
      }

      tempParsed.push({
        lineStart: startSec,
        lineText: fullText,
        syllables,
        isEnhanced: sylMatches.length > 0,
      });
    }

    this._lrc = tempParsed;
    this._lineTimestamps = tempParsed.map((l) => l.lineStart);
  }

  // bisect_right equivalent
  _bisectRight(arr, val) {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= val) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  getAtTime(currentTime) {
    if (!this._lineTimestamps.length) return [];

    const primaryIdx = this._bisectRight(this._lineTimestamps, currentTime) - 1;
    if (primaryIdx < 0) return [];

    const activeLines = [];
    const start = Math.max(0, primaryIdx - 2);
    const end = Math.min(this._lrc.length, primaryIdx + 3);

    for (let i = start; i < end; i++) {
      const line = this._lrc[i];

      let lineEnd;
      if (i + 1 < this._lrc.length) {
        const nextStart = this._lrc[i + 1].lineStart;
        lineEnd = Math.max(nextStart, line.lineStart + 4.0);
      } else {
        lineEnd = line.lineStart + 5.0;
      }

      if (line.lineStart <= currentTime && currentTime <= lineEnd + 1.0) {
        const syls = line.syllables;
        const sTimes = syls.map((s) => s.time);
        const sIdx = this._bisectRight(sTimes, currentTime) - 1;

        let progress = 0.0;
        if (sIdx >= 0) {
          const startT = syls[sIdx].time;
          let nextT;
          if (sIdx + 1 < syls.length) {
            nextT = syls[sIdx + 1].time;
          } else {
            nextT = Math.max(lineEnd, startT + 0.8);
          }
          const duration = nextT - startT;
          progress = duration > 0 ? (currentTime - startT) / duration : 1.0;
        }

        if (
          sIdx >= syls.length - 1 &&
          currentTime > syls[syls.length - 1].time + 0.5
        ) {
          progress = 1.0;
        }

        activeLines.push({
          lineIndex: i,
          syllableIdx: sIdx,
          syllableProgress: Math.min(1.0, Math.max(0.0, progress)),
          isPrimary: i === primaryIdx,
          lineText: line.lineText,
          syllables: syls,
        });
      }
    }

    return activeLines;
  }

  getAllLines() {
    return this._lrc;
  }
}