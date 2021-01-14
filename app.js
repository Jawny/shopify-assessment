const express = require("express");
const bodyparser = require("body-parser");
const mongoose = require("mongoose");
const multer = require("multer");
const GridFsStorage = require("multer-gridfs-storage");
const Grid = require("gridfs-stream");
const methodOverride = require("method-override");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const PORT = process.env.PORT || 8000;
const app = express();

app.set("view engine", "ejs");
app.use(bodyparser.json({ limit: "5mb" }));
app.use(bodyparser.urlencoded({ limit: "5mb", extended: true }));
app.use(methodOverride("_method"));

// Connect to MongoDB
const mongoURI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.vgtx9.mongodb.net/shopify?retryWrites=true&w=majority`;

const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// acceptable filetypes when rendering images
const filetypes = ["image/jpeg", "img/png"];

// Init gfs
let gfs;

conn.once("open", () => {
  // Init stream
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection("uploads");
});

// Create storage engine
// Crypto will generate a random string of characters to set as the image name.
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString("hex") + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: "uploads",
        };
        resolve(fileInfo);
      });
    });
  },
});
const upload = multer({ storage });

// GET Renders index file and if there is any data passed in then the images will be rendered
app.get("/", (req, res) => {
  gfs.files.find().toArray((err, files) => {
    // Check if files exist
    if (!files || files.length === 0) {
      res.render("index", { files: false });
    } else {
      files.map((file) => {
        if (filetypes.includes(file.contentType)) {
          file.isImage = true;
        } else {
          file.isImage = false;
        }
      });
      res.render("index", { files: files });
    }
  });
});

//GET all files
app.get("/files", (req, res) => {
  gfs.files.find().toArray((err, files) => {
    // Check if files exist
    if (!files || files.length === 0) {
      return res.status(404).json({ err: "No files exist" });
    }
    return res.json(files);
  });
});

//GET /image/:filename display single file object
app.get("/image/:filename", (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    // Check if image is a valid file type
    // display it if True else return an error
    if (filetypes.includes(file.contentType)) {
      // Output to browser
      const readstream = gfs.createReadStream(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({ err: "Not an image" });
    }
  });
});

// POST: upload all files to storage
app.post("/upload", upload.array("file", 100), (req, res) => {
  res.redirect("/");
});

// Delete: delete a single file
app.delete("/files/:id", (req, res) => {
  // Delete from gfs storage and then from mongodb
  gfs.remove({ _id: req.params.id, root: "uploads" }, (err, gridStore) => {
    if (err) {
      return res.status(404).json({ err: err });
    }
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
