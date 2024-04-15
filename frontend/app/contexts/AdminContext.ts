import React, { createContext, useState, useContext, useEffect } from 'react';
import { authProvider } from "../../services/auth";

const AdminProvider = ({ children }) => {
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

  const Admin = mongoose.model('Admin', schema);

  mongoose.connect('mongodb+srv://icr-dev:dev@recovery.p7osltx.mongodb.net/', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('Connected to MongoDB');
      queryAdminByEmail('client@example.com');
    })
    .catch((error) => {
      console.error('Error connecting to MongoDB:', error);
    });

  async function queryAdminByEmail(email) {
    try {
      // Find the Admin object by email
      const admin = await Admin.findOne({ email });

      if (admin) {
        // If an admin object is found, log it
        console.log('Admin object found:', admin);
      } else {
        // If no admin object is found, log a message
        console.log('Admin object not found for email:', email);
      }
    } catch (error) {
      console.error('Error querying Admin object:', error);
    } finally {
      mongoose.connection.close();
    }
  }
}

// export const AdminContext = createContext(AdminProvider.queryAdminByEmail)

// export const useAdmin = () => useContext(AdminContext)

export { AdminProvider };