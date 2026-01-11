<!-- PROJECT LOGO -->
<br />
<div>
  <a href="https://github.com/cornellh4i/ithaca-recovery">
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

* [![React][React.js]][React-url]
* [![Next][Next.js]][Next-url]
* [![MongoDB][MongoDB]][MongoDB-url]
* [![Vercel][Vercel]][Vercel-url]

<!-- Setup -->
## Getting Started

### Prerequisites
* Yarn
* Redis
* MongoDB Compass (Recommended)

### Installation

1. Clone the repo
```bash
   git clone https://github.com/cornellh4i/ithaca-recovery.git
   cd ithaca-recovery
```
2. Set up environment variables in `/frontend/.env`

3. Install dependencies and start the development server
```bash
   cd frontend
   yarn install
   yarn run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

5. Login with authenticated Microsoft account

### Project Structure

> Folder structure 

    .
    ├── docs/         # Documentation
    ├── frontend      # Next.js App Router (leveraging server and client sided environments)
    └── README.md

<!-- Developers -->
## Developers
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
[MongoDB]: https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white
[MongoDB-url]: https://www.mongodb.com/
[Vercel]: https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white
[Vercel-url]: https://vercel.com/