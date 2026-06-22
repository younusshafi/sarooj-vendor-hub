const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export class FileTooLargeError extends Error {
  constructor(filename: string) {
    super(
      `File too large. For files over 100 MB, please upload directly to the RFQ Drive folder and inform procurement.`,
    );
    this.name = "FileTooLargeError";
  }
}

export function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new FileTooLargeError(file.name);
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip "data:<mime>;base64," prefix
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to read file as base64"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
