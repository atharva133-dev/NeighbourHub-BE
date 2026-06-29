const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neighbourhub/notices',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 1200, crop: 'limit' }],
  },
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neighbourhub/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  },
});

const communityStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'neighbourhub/communities',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  },
});

function extractPublicId(url) {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  return match ? match[1] : null;
}

module.exports = { cloudinary, storage, avatarStorage, communityStorage, extractPublicId };
