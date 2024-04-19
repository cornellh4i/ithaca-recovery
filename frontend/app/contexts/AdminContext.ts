import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { authProvider } from "../../services/auth";
import mongoose, { Document } from 'mongoose';

// Create a context for the admin user
export const AdminContext = createContext<Document | null>(null);

// Custom hook to use the admin context
export const useAdmin = () => useContext(AdminContext);

interface Props {
  children: ReactNode;
}

// AdminProvider component
export const AdminProvider = ({ children }: Props) => {
  const [admin, setAdmin] = useState<Document | null>(null);

  useEffect(() => {
    // Function to get the logged-in user's email and query the admin object
    const getAdmin = async () => {
      try {
        const account = await authProvider.getAccount();
        if (account) {
          const email = account.username;
          console.log("User is logged in with email:", email);
          await queryAdminByEmail(email, 'URL');
        } else {
          console.log("User is not logged in");
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
      }
    };

    // Define the schema and model for querying the admin object
    const schema = new mongoose.Schema({ email: String });
    const AdminModel = mongoose.model('Admin', schema);

    // Function to query the admin object by email
    const queryAdminByEmail = async (email: string, URL: string) => {
      try {
        await mongoose.connect(URL, { useUnifiedTopology: true } as any);
        console.log('Connected to MongoDB');
        const adminObject = await AdminModel.findOne({ email });
        if (adminObject) {
          console.log('Admin object found:', adminObject);
          setAdmin(adminObject);
        } else {
          console.log('Admin object not found for email:', email);
        }
      } catch (error) {
        console.error('Error querying Admin object:', error);
      } finally {
        mongoose.connection.close();
      }
    };

    // Call the function to get the admin object when the component mounts
    getAdmin();
  }, []);

  // return (
  //   <AdminContext.Provider value= { admin } >
  //   { children }
  //   < /AdminContext.Provider>
  // );

};
