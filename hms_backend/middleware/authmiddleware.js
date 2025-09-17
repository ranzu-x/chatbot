import jwt from "jsonwebtoken";


// JWT Token verification
export const authMiddleWare = (req, res, next) => {
  const token = req?.cookies?.token;
  if(!token) {
    return res.status(401).send({ message: "Unauthorized Access" })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // ✅ Make sure req.user has email/id
    req.user = {
      id: decoded.id,
      email: decoded.email,
      type: decoded.type,
    };
    next();
  }

  catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}