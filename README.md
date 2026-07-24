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
  </ol> 
</details>


<!-- ABOUT THE PROJECT -->
## About The Project
This project aims to develop internal tooling and automation to streamline ICR's event & meeting setup process.

### Built With

* ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
* [![Next][Next.js]][Next-url]
* ![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
* [![Prisma][Prisma.io]][Prisma-url]
* ![NextAuth](https://img.shields.io/badge/NextAuth-000000?style=for-the-badge&logo=nextauth&logoColor=white) ![Google Calendar](https://img.shields.io/badge/Google_Calendar-4285F4?style=for-the-badge&logo=googlecalendar&logoColor=white)
* ![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)
* ![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white) ![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)

<!-- Setup -->
## Documents

Documentation lives in [`docs/`](docs/):
* [`docs/project-structure.md`](docs/project-structure.md) — tech stack, folder layout, data models, auth flow
* [`docs/api-reference.md`](docs/api-reference.md) — every API route, request/response shapes
* [`docs/handoff/user-guide.md`](docs/handoff/user-guide.md) — end-user/admin walkthrough
* [`docs/handoff/technical-decisions.md`](docs/handoff/technical-decisions.md) — why the stack is built the way it is
* [`docs/handoff/integration-guides.md`](docs/handoff/integration-guides.md) — setup steps for each external service
* [`docs/testing/README.md`](docs/testing/README.md) — how the automated test suite (unit/integration/e2e) and CI work
* [`docs/testing/manual-test-script-template.md`](docs/testing/manual-test-script-template.md) — manual pre-release checklist (what CI can't cover)

### Project Structure

> Folder structure 

    .
    ├── frontend      # Next.js App Router (leveraging server and client sided environments)
    ├── docs/         # Documentation (see above)
    └── README.md

### CI/CD & Automation

Everything under [`.github/`](.github/) runs automatically on push/PR to `master`, or on a schedule - no manual triggering needed.

* [`workflows/test.yml`](.github/workflows/test.yml) — lint, unit, integration, Playwright e2e (see [Running Tests](`#running-tests`) below), and a `doc-freshness` job that fails if README.md / `docs/project-structure.md` cite a Node or Next.js major version that no longer matches `frontend/package.json` (via [`.github/scripts/check-doc-versions.sh`](.github/scripts/check-doc-versions.sh))
* [`workflows/codeql.yml`](.github/workflows/codeql.yml) — CodeQL static analysis for security vulnerabilities, on every PR plus a weekly scheduled scan
* [`workflows/bump-node-version.yml`](.github/workflows/bump-node-version.yml) — monthly check for a new Node.js Active LTS release; opens a PR bumping `.nvmrc`/`package.json`/`test.yml` if one exists (Vercel's supported versions still need a manual check before merging)
* [`dependabot.yml`](.github/dependabot.yml) + [`workflows/dependabot-auto-merge.yml`](.github/workflows/dependabot-auto-merge.yml) — weekly dependency-update PRs; the `safe-updates` group (patch- and minor-level bumps, prod or dev) auto-merges once CI is green — major bumps and all GitHub Actions bumps are left for manual review, since those are the ones most likely to carry breaking changes CI doesn't always catch

### Prerequisites
* Node.js 24.x (see `frontend/.nvmrc`)
* Yarn
* MongoDB Compass (Recommended)

### Quickstart

```bash
cd frontend
yarn install
# add a .env file — see docs/handoff/integration-guides.md, section 1, for every variable needed
yarn dev
```

Opens at [http://localhost:3000](http://localhost:3000). See [`docs/project-structure.md`](docs/project-structure.md) and [`docs/handoff/integration-guides.md`](docs/handoff/integration-guides.md) for the full setup (MongoDB, Google OAuth, Google Calendar).

### Running Tests

```bash
yarn test:unit          # pure functions, seconds, no setup
yarn test:integration   # route handlers against an in-memory Mongo replica set
yarn test:e2e           # full Playwright E2E suite (needs `npx playwright install --with-deps chromium` once)
yarn test:all           # unit + integration + e2e, in that order
```

See [`docs/testing/README.md`](docs/testing/README.md) for how the suite and CI work.

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

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Prisma.io]: https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white
[Express.js]: https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB
[Express-url]: https://expressjs.com/
[Prisma-url]: https://www.prisma.io/
