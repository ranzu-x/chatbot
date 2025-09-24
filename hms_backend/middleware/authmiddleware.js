import jwt from "jsonwebtoken";


// JWT Token verification
export const authMiddleWare = (req, res, next) => {
  // console.log("Middleware hit, cookies:", req.cookies);
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access" })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // ✅ Make sure req.user has email/id
    req.user = {

      id:decoded.id,
      name:decoded.name,
      email:decoded.email,
      username:decoded.username,
      hospital_id:decoded.hospital_id,
      hospital_name:decoded.hospital_name,
      roles:decoded.roles,
      permissions:decoded.permissions
    };
    next();
  }

  catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}