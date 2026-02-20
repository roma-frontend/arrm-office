export const LEAVE_TYPES = [
  { code: "AL", label: "Annual Leave", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
  { code: "SL", label: "Sick Leave", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" },
  { code: "UL", label: "Unpaid Leave", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100" },
  { code: "PL", label: "Paid Leave", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" },
  { code: "BL", label: "Birthday Leave", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100" },
  { code: "BT", label: "Business Trip", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" },
] as const;