import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "mock-client-id",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "mock-secret",
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // STRICT DOMAIN GATE: Only allow @albany.edu emails
      if (user.email && user.email.endsWith("@albany.edu")) {
        return true;
      }
      return false; 
    },
  },
  pages: {
    signIn: '/', 
  }
});

export { handler as GET, handler as POST };