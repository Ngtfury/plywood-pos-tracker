import React, { createContext, useContext, useState, useEffect } from "react";
import {
  hasUserPassword,
  setUserPassword,
  verifyUserPassword,
  changeUserPassword,
} from "./userAuth";

interface UserAuthContextValue {
  isAuthenticated: boolean;
  hasPassword: boolean;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
  setupPassword: (password: string) => Promise<{ success: boolean; message?: string }>;
  lock: () => void;
  changePassword: (
    oldPass: string,
    newPass: string
  ) => Promise<{ success: boolean; message: string }>;
}

const UserAuthContext = createContext<UserAuthContextValue | null>(null);

export const UserAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasPassword, setHasPassword] = useState<boolean>(() => hasUserPassword());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    setHasPassword(hasUserPassword());
  }, []);

  const login = async (password: string): Promise<{ success: boolean; message?: string }> => {
    if (!password || !password.trim()) {
      return { success: false, message: "Please enter your password." };
    }

    const isValid = await verifyUserPassword(password);
    if (isValid) {
      setIsAuthenticated(true);
      return { success: true };
    } else {
      return { success: false, message: "Incorrect password. Please try again." };
    }
  };

  const setupPassword = async (
    password: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!password || password.trim().length < 4) {
      return {
        success: false,
        message: "Password must be at least 4 characters long.",
      };
    }

    try {
      await setUserPassword(password);
      setHasPassword(true);
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to set password." };
    }
  };

  const lock = () => {
    setIsAuthenticated(false);
  };

  const changePassword = async (
    oldPass: string,
    newPass: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await changeUserPassword(oldPass, newPass);
    if (res.success) {
      setHasPassword(true);
    }
    return res;
  };

  return (
    <UserAuthContext.Provider
      value={{
        isAuthenticated,
        hasPassword,
        login,
        setupPassword,
        lock,
        changePassword,
      }}
    >
      {children}
    </UserAuthContext.Provider>
  );
};

export function useUserAuth(): UserAuthContextValue {
  const context = useContext(UserAuthContext);
  if (!context) {
    throw new Error("useUserAuth must be used within a <UserAuthProvider>");
  }
  return context;
}
