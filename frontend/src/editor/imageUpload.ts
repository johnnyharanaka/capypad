export interface UploadResponse {
  imageId: string;
  imageCount: number;
  imageCountLimit: number;
  totalImageBytes: number;
  totalImageBytesLimit: number;
}

interface UploadDeps {
  onUploadLimitsUpdate: (next: {
    imageCount: number;
    imageCountLimit: number;
    totalImageBytes: number;
    totalImageBytesLimit: number;
  }) => void;
  onUploadError: (message: string) => void;
  onUploadSuccess?: () => void;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const src = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("Failed to read image"));
    };
    img.src = src;
  });
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  const img = await loadImage(file);
  const maxDimension = 1920;
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, targetW, targetH);

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.82 : undefined;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, quality);
  });

  if (!blob) return file;
  const compressed = new File(
    [blob],
    file.name.replace(
      /\.[^/.]+$/,
      outputType === "image/jpeg" ? ".jpg" : ".png",
    ),
    {
      type: outputType,
      lastModified: Date.now(),
    },
  );

  return compressed.size < file.size ? compressed : file;
}

export async function uploadSingleImage(
  file: File,
  padPath: string,
  deps: UploadDeps,
): Promise<UploadResponse | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    deps.onUploadError("File too large. Max 10MB.");
    return null;
  }

  let optimized = file;
  try {
    optimized = await compressImageForUpload(file);
  } catch {
    optimized = file;
  }

  if (optimized.size > MAX_UPLOAD_BYTES) {
    deps.onUploadError("File too large after processing. Max 10MB.");
    return null;
  }

  const formData = new FormData();
  formData.append("file", optimized);

  try {
    const r = await fetch(`/api/pad/${padPath}/images`, {
      method: "POST",
      body: formData,
    });
    if (!r.ok) {
      const message = await r.text().catch(() => "Upload failed. Try again.");
      throw new Error(message || "Upload failed. Try again.");
    }
    const data = (await r.json()) as UploadResponse;
    deps.onUploadLimitsUpdate({
      imageCount: data.imageCount,
      imageCountLimit: data.imageCountLimit,
      totalImageBytes: data.totalImageBytes,
      totalImageBytesLimit: data.totalImageBytesLimit,
    });
    deps.onUploadSuccess?.();
    return data;
  } catch (err: unknown) {
    deps.onUploadError(
      err instanceof Error ? err.message : "Upload failed. Try again.",
    );
    return null;
  }
}

export async function uploadMultipleImages(
  files: File[],
  padPath: string,
  deps: UploadDeps,
): Promise<string[]> {
  const imageIds: string[] = [];
  for (const file of files) {
    const result = await uploadSingleImage(file, padPath, deps);
    if (result) {
      imageIds.push(result.imageId);
    }
  }
  return imageIds;
}
