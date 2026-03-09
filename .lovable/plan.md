

## Fix: Add missing `jspdf` dependency

The Vercel build fails because `Relatorios.tsx` imports `jspdf` but it's not in `package.json`.

**The fix**: Add `jspdf` to `package.json` dependencies. `html2canvas` is already installed.

### File to edit
- `package.json` — add `"jspdf": "^2.5.2"` to dependencies

