# Hardcoded English Strings in Dashboard Components

## DashboardClient.tsx

### Line 52: Inside `formatDate()` function
- **String:** `"—"`
- **Context:** Default return value for missing dates
- **Code:** `if (!dateStr) return "—";`

### Line 54: Inside `formatDate()` function
- **String:** `"—"`
- **Context:** Default return value for invalid dates
- **Code:** `if (isNaN(d.getTime())) return "—";`

### Line 134: Inside JSX (code element with hardcoded text)
- **String:** `npx convex dev`
- **Context:** Terminal command displayed in code block
- **Code:** `<code className="bg-[var(--background-subtle)] px-2 py-0.5 rounded text-[#2563eb]">npx convex dev</code>`

---

## StatsCard.tsx

✅ **NO HARDCODED STRINGS FOUND**

All text content is properly passed via props or uses translation functions.

---

## EmployeeDashboard.tsx

### Line 75: Inside JSX heading
- **String:** `Welcome, {user?.name?.split(" ")[0]} 👋`
- **Context:** Hardcoded "Welcome," text mixed with dynamic name
- **Code:** `<h2 className="text-2xl font-bold text-[var(--text-primary)]">Welcome, {user?.name?.split(" ")[0]} 👋</h2>`

### Line 149: Inside JSX - Label text in array
- **String:** `"Quality of Work"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Quality of Work", value: latestRating.qualityOfWork },`

### Line 150: Inside JSX - Label text in array
- **String:** `"Efficiency"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Efficiency", value: latestRating.efficiency },`

### Line 151: Inside JSX - Label text in array
- **String:** `"Teamwork"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Teamwork", value: latestRating.teamwork },`

### Line 152: Inside JSX - Label text in array
- **String:** `"Initiative"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Initiative", value: latestRating.initiative },`

### Line 153: Inside JSX - Label text in array
- **String:** `"Communication"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Communication", value: latestRating.communication },`

### Line 154: Inside JSX - Label text in array
- **String:** `"Reliability"`
- **Context:** Performance rating label
- **Code:** Inside map array: `{ label: "Reliability", value: latestRating.reliability },`

### Line 169: Inside JSX - emoji and text string
- **String:** `💪 Strengths`
- **Context:** Section header with emoji
- **Code:** `<p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">💪 Strengths</p>`

### Line 175: Inside JSX - emoji and text string
- **String:** `📈 Areas for Improvement`
- **Context:** Section header with emoji
- **Code:** `<p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">📈 Areas for Improvement</p>`

### Line 181: Inside JSX - emoji and text string
- **String:** `💬 Comments`
- **Context:** Section header with emoji
- **Code:** `<p className="text-xs font-semibold text-[var(--text-muted)] mb-1">💬 Comments</p>`

### Line 292: Inside JSX - Button text
- **String:** `New Request`
- **Context:** Button label in Leave Requests header
- **Code:** `<Plus className="w-4 h-4" />New Request</Link>`

### Line 321: Inside JSX - Text in parentheses
- **String:** `({leave.days} days)`
- **Context:** Days display in leave item
- **Code:** `{format(new Date(leave.startDate), "MMM d")} – {format(new Date(leave.endDate), "MMM d, yyyy")} ({leave.days} days)`

---

## PersonalAnalytics.tsx

### Line 82: Inside JSX heading
- **String:** `📊 Leave Distribution`
- **Context:** Pie chart section header
- **Code:** `<h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">📊 Leave Distribution</h3>`

### Line 118: Inside JSX heading
- **String:** `📅 Recent Requests`
- **Context:** Recent leaves section header
- **Code:** `<h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">📅 Recent Requests</h3>`

### Line 131: Inside JSX - Leave type display
- **String:** `{leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave`
- **Context:** Leave type label with hardcoded "Leave" text
- **Code:** `<p className="text-sm font-medium text-gray-900 dark:text-white">{leave.type.charAt(0).toUpperCase() + leave.type.slice(1)} Leave</p>`

### Line 158: Inside JSX heading
- **String:** `💼 Leave Balances`
- **Context:** Leave balances section header
- **Code:** `<h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">💼 Leave Balances</h3>`

---

## Summary

**Total Files Analyzed:** 4
- DashboardClient.tsx: **3 hardcoded strings**
- StatsCard.tsx: **0 hardcoded strings**
- EmployeeDashboard.tsx: **12 hardcoded strings**
- PersonalAnalytics.tsx: **5 hardcoded strings**

**TOTAL HARDCODED STRINGS: 20**

### Critical Issues (Performance Labels in Arrays):
Lines 149-154 in EmployeeDashboard.tsx contain performance rating labels that should be moved to translation files or configuration constants.

### Medium Issues (Headers with Emojis):
Multiple section headers across files use hardcoded emoji + text combinations that should be translatable.

### Low Priority Issues:
- "days" text in parentheses (EmployeeDashboard.tsx line 321)
- "Leave" suffix in leave type display (PersonalAnalytics.tsx line 131)
