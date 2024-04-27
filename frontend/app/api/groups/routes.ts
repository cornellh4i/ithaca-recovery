// import { PrismaClient } from "@prisma/client";
// import { NextResponse } from "next/server";

// const prisma = new PrismaClient();

// export const POST = async (request: Request) => {
//   try {
//     const { uid, name, email, privilegeMode } = await request.json();

//     const createdUser = await prisma.admin.create({
//       data: {
//         uid: uid,
//         name: name,
//         email: email,
//         privilegeMode: privilegeMode
//       },
//     });

//     return NextResponse.json(createdUser);
//   } catch (error) {
//     console.error(error);
//     return new Response(JSON.stringify({ error: "Internal Server Error" }), {
//       status: 500,
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });
//   }
// }

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { accessToken } = req.body;

    // Define the endpoint and headers for the Microsoft Graph API request
    const endpoint = `https://graph.microsoft.com/v1.0/groups`; //Endpoint?
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
    };

    try {
      const response = await fetch(endpoint, { method: 'GET', headers });
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: 'An error occurred while fetching group list data.' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
