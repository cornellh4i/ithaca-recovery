import React, { createContext, useState, useContext, useEffect } from 'react';
import { authProvider } from "../../services/auth";

const AdminProvider = ({ children }) => {

  const [admin, setAdmin] = useState(null);

  const GetEmail = async () => {
    try {
      const account = await authProvider.getAccount();

      if (account) {
        const email = account.username;
        console.log("User is logged in with email:", email);
      } else {
        // If no account object is returned (i.e., user is not logged in)
        console.log("User is not logged in");
      }
    } catch (error) {
      console.error("Error checking authentication:", error);
    }
  };

  GetEmail();

  const mongoose = require('mongoose');

  const schema = new mongoose.Schema({
    email: String,
  });

  const model = mongoose.model('Admin', schema);

  mongoose.connect(URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('Connected to MongoDB');
      queryAdminByEmail('client@example.com');
    })
    .catch((error) => {
      console.error('Error connecting to MongoDB:', error);
    });

  async function queryAdminByEmail(email) {
    try {
      setAdmin(await model.findOne({ email }));

      if (admin) {
        console.log('Admin object found:', admin);
      } else {
        console.log('Admin object not found for email:', email);
      }
    } catch (error) {
      console.error('Error querying Admin object:', error);
    } finally {
      mongoose.connection.close();
    }
  }
  useEffect(() => {
    queryAdminByEmail('email');
  }, []);
}

export const AdminContext = createContext(null)

export const useAdmin = () => useContext(AdminContext)

export { AdminProvider };