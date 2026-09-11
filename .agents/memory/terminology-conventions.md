---
name: User-facing account terminology
description: Copy rules for distinguishing the two OnSite account types without changing internal role values.
---

Use **Sub-contractor** for worker-side user-facing copy and **Hiring company** for company-side user-facing copy. Keep internal role keys, IDs, routes, permissions, schemas, and data values unchanged. Preserve legitimate legal and business field labels such as Company Name, Company Number, Company address, and Company VAT number.

**Why:** The product uses different language for account roles than the underlying `worker` and `company` implementation values; blind replacement can damage legal field meaning or break behavior.

**How to apply:** Review visible headings, buttons, empty states, notifications, agreement labels, dashboards, Request Labour copy, attendance, pre-start, profile, and account areas individually. Prefer natural phrases such as “Preferred sub-contractors” and “Hiring company dashboard.”