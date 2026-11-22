# Third-Party Notices

This project, **Dream** (© 2026 Saja / Dream), includes or depends on third-party
software. Each component remains subject to its own license. Before commercial
distribution, review and comply with all applicable third-party license terms.

## Key Dependencies (review before release)

| Package | Purpose | License (verify) |
|---|---|---|
| react, react-dom | UI framework | MIT |
| vite, @vitejs/plugin-react | Build tooling | MIT |
| tailwindcss, @tailwindcss/vite | Styling | MIT |
| @supabase/supabase-js | Supabase client | MIT |
| lucide-react | Icons | ISC |
| recharts | Charts | MIT |
| motion | Animations | MIT |
| xlsx | Spreadsheet parsing/export | Apache-2.0 (verify exact version terms) |
| xlsx-js-style | Spreadsheet styling/export | MIT (verify) |
| jspdf | PDF generation | MIT |
| html2canvas / html2canvas-pro | DOM capture | MIT |
| @fontsource/cairo, @fontsource/tajawal | Fonts | OFL-1.1 (verify) |
| firebase | Firebase SDK (if used) | Apache-2.0 |
| @sentry/react | Error monitoring (if enabled) | MIT |
| express | Server/runtime tooling | MIT |

## Required Actions Before Commercial Release

1. Run a license audit: `npx license-checker --summary` (or equivalent SBOM tool).
2. Confirm the exact license for every production dependency, especially spreadsheet/PDF/font packages.
3. Keep required copyright/license notices for MIT/Apache/OFL components.
4. Review terms for external services: Supabase, Cloudinary, Google, Sentry, Firebase, etc.
5. Have legal counsel review the proprietary license, customer agreements, privacy policy, and terms of use.
