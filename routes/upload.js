var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/upload')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')
let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let { RandomToken } = require('../utils/GenToken')
let { sendPasswordMail } = require('../utils/senMailHandler')

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, "../uploads", req.params.filename);
    res.sendFile(pathFile)
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];
    let result = [];
    let categories = await categoryModel.find({});
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title);
    let getSku = products.map(p => p.sku)
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let rowErrors = [];
        const cells = worksheet.getRow(row);
        let sku = cells.getCell(1).value;
        let title = cells.getCell(2).value;
        let category = cells.getCell(3).value;//hop le
        let price = Number.parseInt(cells.getCell(4).value);
        let stock = Number.parseInt(cells.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            rowErrors.push("price phai so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowErrors.push("stock phai so duong")
        }
        if (!categoriesMap.has(category)) {
            rowErrors.push('category khong hop le')
        }
        if (getTitle.includes(title)) {
            rowErrors.push('title da ton tai')
        }
        if (getSku.includes(sku)) {
            rowErrors.push('sku da ton tai')
        }
        if (rowErrors.length > 0) {
            result.push(rowErrors);
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newObj = new productModel({
                sku:sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-', lower: true, locale: 'vi',
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category)
            })
            await newObj.save({ session })
            let newInventory = new inventoryModel({
                product: newObj._id,
                stock: stock
            })
            await newInventory.save({ session })
            await session.commitTransaction();
            await session.endSession()
            await newInventory.populate('product')
            getSku.push(sku);
            getTitle.push(title)
            result.push(newInventory);
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push(error.message);
        }
        //khong co loi
    }
    res.send(result)
})

router.post('/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    try {
        let workbook = new exceljs.Workbook();
        let pathFile = path.join(__dirname, "../uploads", req.file.filename);
        await workbook.xlsx.readFile(pathFile)
        if (workbook.worksheets.length === 0) {
            res.status(400).send({ message: "file khong co du lieu" });
            return;
        }
        let worksheet = workbook.worksheets[0];
        let userRole = await roleModel.findOne({
            name: { $regex: /^user$/i },
            isDeleted: false
        });
        if (!userRole) {
            res.status(400).send({ message: "role user khong ton tai" });
            return;
        }
        let seenUsernames = new Set();
        let seenEmails = new Set();
        let summary = [];
        let processed = 0;
        let created = 0;
        for (let index = 2; index <= worksheet.rowCount; index++) {
            let currentRow = worksheet.getRow(index);
            if (!currentRow || !currentRow.hasValues) {
                continue;
            }
            let usernameRaw = currentRow.getCell(1).value;
            let emailRaw = currentRow.getCell(2).value;
            let username = usernameRaw ? usernameRaw.toString().trim() : "";
            let email = emailRaw ? emailRaw.toString().trim() : "";
            if (!username && !email) {
                continue;
            }
            processed++;
            let rowResult = {
                row: index,
                username: username,
                email: email
            };
            if (!username || !email) {
                rowResult.error = "username va email khong duoc de trong";
                summary.push(rowResult);
                continue;
            }
            if (!EMAIL_REGEX.test(email)) {
                rowResult.error = "email khong hop le";
                summary.push(rowResult);
                continue;
            }
            let normalizedEmail = email.toLowerCase();
            if (seenUsernames.has(username) || seenEmails.has(normalizedEmail)) {
                rowResult.error = "du lieu trung lap trong file";
                summary.push(rowResult);
                continue;
            }
            seenUsernames.add(username);
            seenEmails.add(normalizedEmail);
            let [usernameExists, emailExists] = await Promise.all([
                userModel.findOne({ username: username, isDeleted: false }),
                userModel.findOne({ email: normalizedEmail, isDeleted: false })
            ]);
            if (usernameExists) {
                rowResult.error = "username da ton tai";
                summary.push(rowResult);
                continue;
            }
            if (emailExists) {
                rowResult.error = "email da ton tai";
                summary.push(rowResult);
                continue;
            }
            let password = RandomToken(16);
            let newUser = new userModel({
                username: username,
                email: normalizedEmail,
                password: password,
                role: userRole._id
            });
            let savedUser = null;
            try {
                savedUser = await newUser.save();
                await sendPasswordMail(normalizedEmail, password);
                rowResult.status = "created";
                rowResult.userId = savedUser._id;
                created++;
            } catch (error) {
                rowResult.error = error.message;
                if (savedUser && savedUser._id) {
                    await userModel.findByIdAndDelete(savedUser._id);
                }
            }
            summary.push(rowResult);
        }
        res.send({
            processed: processed,
            created: created,
            results: summary
        })
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
})



module.exports = router;