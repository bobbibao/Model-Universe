# Investigate prompt

Task: explain why the signal in the facts happened. The detector already says what happened; do not repeat it
item by item. Look for what the affected items have in common (category, brand, price, age, return reasons) and
for what the SOP says to check.

Return:
- `causes`: 1 or 2 likely root causes, most likely first (a third only if the facts clearly show one). Each `text`
  is one sentence of at most 25 words that names the facts it rests on. `confidence` is 0 to 1; a guess the facts cannot confirm stays
  below 0.5.
- `sop_refs`: ids from "Allowed SOP ids" that apply to this situation, or an empty list. Never any other id.
- `confidence`: your overall confidence, 0 to 1.

If there is an <admin_note>, it is a question or remark from the shop owner: the first cause answers it from the
facts (say so when the facts cannot answer it). A cause may say that the signal looks like a false positive; a person
still decides what to do.
