import { PrismaClient } from "@prisma/client";
import { IAdmin } from "../../../../util/models";

const prisma = new PrismaClient();

export const DELETE = async (email: IAdmin['email']) => {
  try {
    const deleteUser = await prisma.admin.delete({
      where: {
        email: email,
      },
    });
    return deleteUser;
  }
  catch (error) {
    console.error("Admin not found: ", error);
    return null;
  }
}
