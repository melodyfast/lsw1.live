import { generateReactHelpers } from "@uploadthing/react";
import type { FileRouter } from "uploadthing/next";

// Define the router type inline since we combined the files
type OurFileRouter = {
  downloadFile: {
    input: Record<string, never>;
    output: {
      url: string;
      name: string;
      size: number;
      type: string;
    };
  };
  profilePicture: {
    input: Record<string, never>;
    output: {
      url: string;
      name: string;
      size: number;
      type: string;
    };
  };
};

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: "/api/uploadthing",
});

