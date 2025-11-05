import { createUploadthing, createRouteHandler, type FileRouter } from "uploadthing/next";

// Initialize UploadThing - this will use UPLOADTHING_SECRET and UPLOADTHING_APP_ID from env
const f = createUploadthing();

// Check if UploadThing environment variables are set
if (!process.env.UPLOADTHING_SECRET || !process.env.UPLOADTHING_APP_ID) {
  console.error("Missing UploadThing environment variables. Please set UPLOADTHING_SECRET and UPLOADTHING_APP_ID");
}

// Define the file router
const ourFileRouter = {
  downloadFile: f({ 
    blob: { 
      maxFileSize: "64MB", 
      maxFileCount: 1 
    } 
  })
    .onUploadComplete(async ({ file }) => {
      console.log("File upload complete:", file.url);
      return {};
    }),
  profilePicture: f({ 
    image: { 
      maxFileSize: "4MB", 
      maxFileCount: 1 
    } 
  })
    .onUploadComplete(async ({ file }) => {
      console.log("Profile picture upload complete:", file.url);
      return {};
    }),
} satisfies FileRouter;

// Create the route handler - this returns an object with GET and POST handlers
const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});

// Export for Vercel serverless functions
// Vercel automatically detects named exports GET and POST
export { GET, POST };
export type { FileRouter };
