// ── CSV import helpers (extracted from App.jsx) ───────────────────────────

// Built-in CSV Parser (RFC 4180 compliant)
export function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

// Smart Category Classifier based on event context keywords
export function classifyCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('marry') || text.includes('marriage') || text.includes('wife') || text.includes('husband') || text.includes('love') || text.includes('relationship') || text.includes('conson') || text.includes('honeymoon') || text.includes('son') || text.includes('daughter') || text.includes('child') || text.includes('family') || text.includes('parents') || text.includes('brother')) {
    return 'Relationship';
  }
  if (text.includes('spiritual') || text.includes('yoga') || text.includes('guru') || text.includes('meditation') || text.includes('occult') || text.includes('temple') || text.includes('religious') || text.includes('gayatri') || text.includes('sahaja')) {
    return 'Spiritual';
  }
  if (text.includes('travel') || text.includes('relocation') || text.includes('moved') || text.includes('shifted') || text.includes('hometown') || text.includes('pg') || text.includes('rented house') || text.includes('bangalore') || text.includes('pune') || text.includes('hyderabad') || text.includes('uk') || text.includes('paris') || text.includes('switzerland') || text.includes('italy') || text.includes('kashmir')) {
    return 'Travel';
  }
  if (text.includes('health') || text.includes('surgery') || text.includes('kidney') || text.includes('illness') || text.includes('chickenpox') || text.includes('hospital') || text.includes('diseases') || text.includes('accident') || text.includes('sick')) {
    return 'Health';
  }
  if (text.includes('finance') || text.includes('financial') || text.includes('debt') || text.includes('money') || text.includes('savings') || text.includes('donation') || text.includes('loss') || text.includes('jobless') || text.includes('without money') || text.includes('hike') || text.includes('salary')) {
    return 'Finance';
  }
  if (text.includes('job') || text.includes('work') || text.includes('office') || text.includes('boss') || text.includes('company') || text.includes('promotion') || text.includes('mca') || text.includes('degree') || text.includes('graduation') || text.includes('school') || text.includes('college') || text.includes('study') || text.includes('architect') || text.includes('engineer') || text.includes('specialist') || text.includes('consultant')) {
    return 'Career';
  }
  
  return 'Career'; // default
}

// Smart Date Range Parser
export function parseEventDates(yearStr) {
  const months = {
    january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11
  };

  const cleanStr = yearStr.trim().toLowerCase().replace(/\s+/g, ' ');

  // Split by dash/en-dash/em-dash or raw "to" or "–"
  const parts = cleanStr.split(/[\u2013\u2014-]|to/).map(p => p.trim());

  function parseSingleDateStr(str) {
    if (!str) return null;
    // Check for month and year, e.g. "march 2000"
    const wordMatch = str.match(/([a-z]+)\s+(\d{4})/);
    if (wordMatch) {
      const mName = wordMatch[1];
      const yNum = parseInt(wordMatch[2]);
      if (months[mName] !== undefined) {
        return { year: yNum, month: months[mName] };
      }
    }
    // Check for year only, e.g. "2000"
    const yearMatch = str.match(/\b(\d{4})\b/);
    if (yearMatch) {
      return { year: parseInt(yearMatch[1]), month: null };
    }
    return null;
  }

  if (parts.length === 2) {
    const startInfo = parseSingleDateStr(parts[0]);
    const endInfo = parseSingleDateStr(parts[1]);
    
    let startDate;
    let endDate;

    if (startInfo) {
      if (startInfo.month !== null) {
        const m = (startInfo.month + 1).toString().padStart(2, '0');
        startDate = `${startInfo.year}-${m}-01`;
      } else {
        startDate = `${startInfo.year}-01-01`;
      }
    } else {
      startDate = '2000-01-01';
    }
    
    if (endInfo) {
      if (endInfo.month !== null) {
        const m = (endInfo.month + 1).toString().padStart(2, '0');
        const lastDay = new Date(endInfo.year, endInfo.month + 1, 0).getDate();
        endDate = `${endInfo.year}-${m}-${lastDay.toString().padStart(2, '0')}`;
      } else {
        endDate = `${endInfo.year}-12-31`;
      }
    } else if (startInfo) {
      endDate = `${startInfo.year}-12-31`;
    } else {
      endDate = '2000-12-31';
    }
    return { startDate, endDate };
  } else {
    const info = parseSingleDateStr(cleanStr);
    if (info) {
      if (info.month !== null) {
        const m = (info.month + 1).toString().padStart(2, '0');
        const lastDay = new Date(info.year, info.month + 1, 0).getDate();
        return {
          startDate: `${info.year}-${m}-01`,
          endDate: `${info.year}-${m}-${lastDay.toString().padStart(2, '0')}`
        };
      } else {
        return {
          startDate: `${info.year}-01-01`,
          endDate: `${info.year}-12-31`
        };
      }
    }
  }
  return { startDate: '2000-01-01', endDate: '2000-12-31' };
}
