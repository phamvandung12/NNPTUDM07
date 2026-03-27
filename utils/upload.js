const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const timestampFileName = (originalName) => {
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_]/g, '');
    return `${base || 'file'}-${Date.now()}${ext}`;
};

const imageFilter = (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Chi cho phep upload hinh anh'));
    }
};

const excelFilter = (_req, file, cb) => {
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];
    if (file.mimetype && allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chi cho phep upload file excel (.xlsx, .xls)'));
    }
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        cb(null, timestampFileName(file.originalname));
    }
});

const uploadImage = multer({
    storage,
    fileFilter: imageFilter
});

const uploadExcel = multer({
    storage,
    fileFilter: excelFilter
});

module.exports = { uploadImage, uploadExcel };
