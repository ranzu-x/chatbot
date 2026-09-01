import axios from "axios";

// Standard valid sample binary buffers
const SAMPLE_MEDIA = {
  IMAGE: {
    mime: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64"
    ),
  },
  DOCUMENT: {
    mime: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF"),
  },
};

/**
 * Generate a valid Meta header_handle for template submission
 */
export async function getMetaSampleHandle(accessToken, type = "IMAGE", customUrl = null) {
  try {
    const mediaType = (type || "IMAGE").toUpperCase();
    let fileBuffer = SAMPLE_MEDIA[mediaType]?.buffer || SAMPLE_MEDIA.IMAGE.buffer;
    let mimeType = SAMPLE_MEDIA[mediaType]?.mime || "image/jpeg";

    // If a custom public URL is provided, try fetching its buffer; otherwise use reliable base sample
    if (customUrl && typeof customUrl === "string" && customUrl.startsWith("http")) {
      try {
        const fetchRes = await axios.get(customUrl, { responseType: "arraybuffer", timeout: 4000 });
        if (fetchRes.data && fetchRes.data.byteLength > 0) {
          fileBuffer = Buffer.from(fetchRes.data);
          mimeType = fetchRes.headers["content-type"] || mimeType;
        }
      } catch (fErr) {
        console.warn("Could not fetch custom media URL for sample, using built-in fallback:", fErr.message);
      }
    }

    // Step 1: Create Resumable Upload Session
    const sessRes = await axios.post("https://graph.facebook.com/v21.0/app/uploads", null, {
      params: {
        file_length: fileBuffer.length,
        file_type: mimeType,
        access_token: accessToken,
      },
      timeout: 10000,
    });

    const uploadId = sessRes.data.id;

    // Step 2: Upload binary bytes to get the 'h' handle
    const uploadRes = await axios.post(`https://graph.facebook.com/v21.0/${uploadId}`, fileBuffer, {
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: 0,
        "Content-Type": mimeType,
      },
      timeout: 10000,
    });

    return uploadRes.data.h;
  } catch (err) {
    console.error("Failed to generate Meta sample media handle:", err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || "Failed to generate Meta sample media handle");
  }
}
