<!-- PROJECT LOGO -->
<br />
<div>
  <a href="https://github.com/github_username/repo_name">
    <img src="https://chambermaster.blob.core.windows.net/images/members/1313/4585/MemLogo_Ithaca%20Community%20Recovery.png" alt="Logo" width="120" height="120">
    <img src="https://www.ithacacommunityrecovery.org/wp-content/uploads/cropped-new_logo_4.png" alt="Logo" width="120" height="120">
  </a>

<h3>Ithaca Community Recovery</h3>

  <p >
    Ithaca Community Recovery is a non-profit organization working to serve as a community resource for members of 12 Step and other recovery-oriented groups. They offer safe and affordable event and meeting spaces for recoverers of addiction.
    <br />    
  </p>
</div>



<!-- TABLE OF CONTENTS --> 
<details open="open"> 
  <summary>Table of Contents</summary> 
  <ol> 
    <li> 
      <a href="#about-the-project">About The Project</a> 
      <ul> 
        <li>
          <a href="#built-with">Built With</a>
        </li> 
      </ul> 
    </li> 
    <li>
      <a href="#documents">Documents</a>
    </li> 
    <li>
      <a href="#project-structure">Project Structure</a>
    </li> 
    <li>
      <a href="#cicd--automation">CI/CD & Automation</a>
    </li> 
    <li>
      <a href="#prerequisites">Prerequisites</a>
    </li> 
    <li>
      <a href="#developers">Developers</a> 
    </li> 
    <li>
      <a href="#versioning">Versioning</a>
    </li>
  </ol> 
</details>


<!-- ABOUT THE PROJECT -->
## About The Project
This project aims to develop internal tooling and automation to streamline ICR's event & meeting setup process.

### Built With

* [![Next.js][Next.js]][Next.js-url] [![React][React]][React-url]
* [![Neon][Neon]][Neon-url] [![PostgreSQL][PostgreSQL]][PostgreSQL-url] [![Prisma][Prisma]][Prisma-url]
* [![NextAuth][NextAuth]][NextAuth-url] [![Google Calendar][Google Calendar]][Google Calendar-url] [![Zoom][Zoom]][Zoom-url]
* [![Vercel][Vercel]][Vercel-url]
* [![Pagefind][Pagefind]][Pagefind-url] [![Marked][Marked]][Marked-url]
* [![Playwright][Playwright]][Playwright-url] [![Jest][Jest]][Jest-url]

<!-- Setup -->
## Documents

Documentation lives in [`docs/`](docs/), organized by audience — see [`docs/README.md`](docs/README.md) for the full index:
* **[User Guide](docs/01-user-guide/)** — for ICR board members using the platform day to day
* **[Handoff](docs/02-handoff/)** — for ICR leadership and future maintainers: ownership, credentials, deployment, backups, support, contingency
* **[Development](docs/03-development/)** — for developers working on the codebase: architecture, API reference, integration setup, testing

### Project Structure

> Folder structure 

    .
    ├── frontend      # Next.js App Router (leveraging server and client sided environments)
    ├── docs/         # Documentation (see above)
    └── README.md

### CI/CD & Automation

Everything under [`.github/`](.github/) runs automatically on push/PR to `master` or on a schedule.

* [`workflows/test.yml`](.github/workflows/test.yml) — lint, typecheck, unit, component, integration, Playwright e2e (see [Running Tests](#running-tests) below), and a `doc-freshness` job that fails if README.md / `docs/03-development/project-structure.md` cite a Node or Next.js major version that no longer matches `frontend/package.json` (via [`.github/scripts/check-doc-versions.sh`](.github/scripts/check-doc-versions.sh))
* [`workflows/codeql.yml`](.github/workflows/codeql.yml) — CodeQL static analysis for security vulnerabilities, on every PR plus a weekly scheduled scan
* [`workflows/bump-node-version.yml`](.github/workflows/bump-node-version.yml) — monthly check for a new Node.js Active LTS release; opens a PR bumping `.nvmrc`/`package.json`/`test.yml` if one exists (Vercel's supported versions still need a manual check before merging)
* [`workflows/calver-bump.yml`](.github/workflows/calver-bump.yml) — monthly CalVer bump (see [Versioning](#versioning)); opens a PR resetting `PATCH` to `0` on the 1st of each month
* [`dependabot.yml`](.github/dependabot.yml) + [`workflows/dependabot-auto-merge.yml`](.github/workflows/dependabot-auto-merge.yml) — weekly dependency-update PRs; the `safe-updates` group (patch- and minor-level bumps, prod or dev) auto-merges once CI is green — major bumps and all GitHub Actions bumps are left for manual review, since those are the ones most likely to carry breaking changes CI doesn't always catch

### Prerequisites
* Node.js 24.x (see `frontend/.nvmrc`)
* Yarn
* A [Neon](https://neon.tech) Postgres project (or any Postgres instance) for `DATABASE_URL`

### Quickstart

```bash
cd frontend
yarn install
# add a .env file — see docs/03-development/environment-variables.md for every variable needed
yarn dev
```

Opens at [http://localhost:3000](http://localhost:3000). See
[`docs/03-development/local-setup.md`](docs/03-development/local-setup.md) for a full guided
walkthrough (env vars, running the test suite, making a first change), or
[`docs/03-development/project-structure.md`](docs/03-development/project-structure.md) and
[`docs/03-development/integration-guides.md`](docs/03-development/integration-guides.md) for
architecture and per-service setup (Postgres, Google OAuth, Google Calendar, Zoom).

### Running Tests

```bash
yarn lint                # ESLint (part of test:all below)
yarn lint:css             # stylelint — separate from yarn lint (part of test:all below)
yarn typecheck           # tsc --noEmit — full cross-file type-checking (part of test:all below)
yarn test:unit           # pure functions, seconds, no setup
yarn test:component      # individual components in isolation, seconds, no setup
yarn test:integration    # route handlers against an embedded Postgres instance
yarn test:e2e            # full Playwright E2E suite (needs `yarn playwright install --with-deps chromium` once)
yarn test:all            # lint + lint:css + typecheck + unit + component + integration + e2e, in that order
```

See [`docs/03-development/testing/README.md`](docs/03-development/testing/README.md) for how the suite and CI work.

<!-- Developers -->
## Developers
<details open="open">
  <summary>Summer 2025 – Summer 2026 Developers</summary>

  - Sophie L Wang & Tuni Le
</details>

<details>
  <summary>Spring 2025 Developers</summary>

  - Tech Leads: Sophie L Wang & Tuni Le
  - David Valarezo 
  - Leane Ying
  - Grace Matsuoka
  - Samantha Cruz 
  - Nathan Dang
  - Sheki Okwayo
  - Tanya Aravind
  - Victoria Yu 
</details>

<details>
  <summary>Fall 2024 Developers</summary>

  - Tech Leads: Owen Chen & Tuni Le
  - Sophie L Wang
  - Leane Ying
  - Phoebe Qian
  - Brandon Lerit
  - Alisha Varma
  - Tanvi Mavani
  - Sophie Strausberg 
</details>

<details>
  <summary>Spring 2024 Developers</summary>

  - Tech Lead: Joseph Ugarte
  - Mohammad Islam
  - Sophie L Wang
  - Sneha Rajaraman
  - Sanya Mahajan
  - Srija Ghosh
</details>

<!-- Versioning -->
## Versioning

This project uses [CalVer](https://calver.org/) (`YYYY.MM.PATCH`). For a detailed history of changes about across versions, please refer to our [release notes](https://github.com/cornellh4i/ithaca-recovery/releases/).

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[Next.js]: https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next.js-url]: https://nextjs.org/
[React]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[Neon]: https://img.shields.io/badge/Neon-018281?style=for-the-badge&logo=neon&logoColor=white
[Neon-url]: https://neon.tech/
[PostgreSQL]: https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/
[Prisma]: https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white
[Prisma-url]: https://www.prisma.io/
[NextAuth]: https://img.shields.io/badge/NextAuth-000000?style=for-the-badge&logo=nextauth&logoColor=white
[NextAuth-url]: https://next-auth.js.org/
[Google Calendar]: https://img.shields.io/badge/Google_Calendar-4285F4?style=for-the-badge&logo=googlecalendar&logoColor=white
[Google Calendar-url]: https://calendar.google.com/
[Zoom]: https://img.shields.io/badge/Zoom-2D8CFF?style=for-the-badge&logo=zoom&logoColor=white
[Zoom-url]: https://zoom.us/
[Vercel]: https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white
[Vercel-url]: https://vercel.com/
[Playwright]: https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white
[Playwright-url]: https://playwright.dev/
[Jest]: https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white
[Jest-url]: https://jestjs.io/
[Pagefind]: https://img.shields.io/badge/Pagefind-000000?style=for-the-badge
[Pagefind-url]: https://pagefind.app/
[Marked]: https://img.shields.io/badge/Marked-000000?style=for-the-badge&logo=markdown&logoColor=white
[Marked-url]: https://marked.js.org/
