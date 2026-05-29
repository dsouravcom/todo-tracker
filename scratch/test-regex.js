// Simulate exactly what scanFile does line by line
const PRIORITY_PATTERNS = [
  { regex: /(?<!:)\/\/!todo(?:[:\s]+(.*))?$/i,  kind: "p1" },
  { regex: /(?<!:)\/\/@todo(?:[:\s]+(.*))?$/i,  kind: "p2" },
  { regex: /(?<!:)\/\/#todo(?:[:\s]+(.*))?$/i,  kind: "p3" },
  { regex: /(?<!:)\/\/\$todo(?:[:\s]+(.*))?$/i, kind: "p4" },
  { regex: /(?<!:)\/\/\?todo(?:[:\s]+(.*))?$/i, kind: "p5" },
];
const NORMAL_TODO_REGEX = /(?<!:)\/\/\s*TODO(?:[:\s]+(.*))?$/i;

// Exact content of the file in screenshot (lines 11-14)
const lines = [
  "// todo add a new user route",
  "//@todo",
  "// todo",
  "// todo - this is my new todo",
];

lines.forEach((line, index) => {
  const lineNumber = index + 11;

  let priorityMatched = false;
  for (const { regex, kind } of PRIORITY_PATTERNS) {
    const match = line.match(regex);
    if (match) {
      console.log(`Line ${lineNumber}: [${kind}] "${(match[1] || "").trim()}" — from "${line}"`);
      priorityMatched = true;
      break;
    }
  }

  if (!priorityMatched) {
    const normalMatch = line.match(NORMAL_TODO_REGEX);
    if (normalMatch) {
      console.log(`Line ${lineNumber}: [normal] "${(normalMatch[1] || "").trim()}" — from "${line}"`);
    } else {
      console.log(`Line ${lineNumber}: *** NOT MATCHED *** — "${line}"`);
    }
  }
});
