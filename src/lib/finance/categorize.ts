export interface CategoryRule {
  id: string;
  name: string;
  /** Lower-case keywords or phrases. */
  keywords: readonly string[];
}

/** Starter categories created for every new user. Users can edit keywords later. */
export const DEFAULT_EXPENSE_CATEGORIES: ReadonlyArray<{ name: string; keywords: string[] }> = [
  { name: "Food & Dining", keywords: ["swiggy", "zomato", "restaurant", "cafe", "pizza", "dominos", "mcdonalds", "kfc", "biryani", "eatsure"] },
  { name: "Groceries", keywords: ["bigbasket", "blinkit", "zepto", "dmart", "grocery", "supermarket", "instamart", "vegetables", "milk"] },
  { name: "Transport", keywords: ["uber", "ola", "rapido", "metro", "petrol", "diesel", "fuel", "fastag", "parking"] },
  { name: "Travel", keywords: ["irctc", "makemytrip", "goibibo", "redbus", "flight", "indigo", "hotel", "airbnb", "train"] },
  { name: "Shopping", keywords: ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "shopping"] },
  { name: "Bills & Utilities", keywords: ["electricity", "bescom", "water bill", "gas", "maintenance", "lpg"] },
  { name: "Mobile & Internet", keywords: ["airtel", "jio", "vodafone", "broadband", "recharge", "wifi", "act fibernet"] },
  { name: "Entertainment", keywords: ["netflix", "spotify", "hotstar", "prime video", "bookmyshow", "youtube premium", "movie"] },
  { name: "Health", keywords: ["pharmacy", "apollo", "hospital", "medplus", "doctor", "clinic", "medicine", "lab test"] },
  { name: "Rent", keywords: ["rent", "landlord"] },
  { name: "Insurance", keywords: ["insurance", "premium", "lic"] },
  { name: "Education", keywords: ["tuition", "school fee", "college", "course", "udemy", "coursera", "books"] },
  { name: "Personal Care", keywords: ["salon", "spa", "haircut", "gym", "cult fit"] },
  { name: "Other", keywords: [] },
];

export const DEFAULT_INCOME_CATEGORIES: ReadonlyArray<{ name: string; keywords: string[] }> = [
  { name: "Salary", keywords: ["salary", "payroll", "wages"] },
  { name: "Business", keywords: ["invoice", "client payment", "freelance", "consulting"] },
  { name: "Interest", keywords: ["interest", "fd maturity", "dividend"] },
  { name: "Refund", keywords: ["refund", "cashback", "reversal"] },
  { name: "Gift", keywords: ["gift", "bonus"] },
  { name: "Other", keywords: [] },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Suggest a category from a transaction description. Keywords match whole words/phrases
 * (so "ola" does not match "cola"); the longest matching keyword wins.
 * Returns null when nothing matches, so the UI can ask the user instead of guessing.
 */
export function suggestCategory<T extends CategoryRule>(
  description: string | null | undefined,
  categories: readonly T[],
): T | null {
  const text = (description ?? "").toLowerCase().trim();
  if (!text) return null;

  let best: T | null = null;
  let bestLength = 0;
  for (const category of categories) {
    for (const keyword of category.keywords) {
      const word = keyword.trim().toLowerCase();
      if (!word) continue;
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`);
      if (pattern.test(text) && word.length > bestLength) {
        best = category;
        bestLength = word.length;
      }
    }
  }
  return best;
}
