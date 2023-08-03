require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
require("./connection/database")(mongoose);

const cors = require("cors");
const passport = require("passport");
const cookieSession = require('cookie-session');
const bcrypt = require("bcrypt");
const bodyparser = require("body-parser");
const localStorage = require("localStorage");
// const session = require("express-session");
const logger = require('morgan');
const sessionstorage = require("sessionstorage");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const hbs = require("nodemailer-express-handlebars")
// const expressHbs = require("express-handlebars");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const GoogleStrategy = require('passport-google-oidc');
// const SQLiteStore = require('connect-sqlite3')(session);
const path = require("path");

const filesPayloadExists = require("./middleware/filesPayloadExists");
const fileExtLimiter = require("./middleware/fileExtLimiter");
const fileSizeLimiter = require("./middleware/fileSizeLimiter");

//********************************* CONTROLLERS ****************************************** */

const authRoutes = require("./controllers/authRoutes");
const adminRoutes = require("./controllers/adminRoutes");
const IITRoutes = require("./controllers/IITRoutes");
const IITTests = require("./controllers/IITTestRoutes");
const selfStudy = require("./controllers/selfstudyRoutes");
const STEM = require("./controllers/stemRoutes");
const Iq = require("./controllers/iqRoutes");
const profile = require("./controllers/profileRoutes");
const payment = require("./controllers/paymentRoutes");

//********************************* CONFIGURATIONS ****************************************** */

// app.use(bodyparser.urlencoded({ extended: false }));
// app.use(bodyparser.json());
app.use(bodyparser.json({ limit: "50mb" }));
app.use(
  bodyparser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);
app.use(cors());

// app.set("trust proxy", 1); // trust first proxy
// app.use(
//   session({
//     secret: "secret",
//     resave: false,
//     saveUninitialized: true,
//     cookie: { secure: true, maxAge: 100000000, httpOnly: false },
//   })
// );
app.use(
  cookieSession({
    name: 'session',
    keys: ['cyberwolve'],
    maxAge: 24*60*60*100
  })
)


app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/iit", IITRoutes);
app.use("/iit-tests", IITTests);
app.use("/selfstudy", selfStudy);
app.use("/stem", STEM);
app.use("/iq", Iq);
app.use("/profile", profile);
app.use("/payment", payment);

// app.engine(
//   "hbs",
//   hbs({
//     extname: "hbs",
//     defaultLayout: 'main-layout',
//     layoutsDir: "views"
//   })
// );
// app.set("view engine", "hbs");
// app.set("views", "views");

cloudinary.config({
  cloud_name: "db0vkpdye",
  api_key: "321311331486674",
  api_secret: "3K_bVdk1OhgWQFvfQi-qKOZiGdY",
});

//********************************* SCHEMAS ****************************************** */

const User = require("./Schemas/Schema");
const Admins = require("./Schemas/adminSchema");
const Notifications = require("./Schemas/notificationsSchema");

//********************************* BASIC ROUTES ****************************************** */

app.use(function(err, req, res, next) {
  // in case of specific URIError
  if (err instanceof URIError) {
      err.message = 'Failed to decode param: ' + req.url;
      err.status = err.statusCode = 400;

      console.log(err.message)
      console.log(err)

      // .. your redirect here if still needed
      return res.redirect(['https://', req.get('Host'), req.url].join(''));
  } else {
      // ..
  }
  // ..
});



app.post("/login", async (req, res) => {
  let admin = false;
  const { email, password } = req.body;

  let userlogin = await User.findOne({ email })
  if (!userlogin) {
    userlogin = await Admins.findOne({ email });
    if (!userlogin) {
      return res.status(401).send();
    } else {
      admin = true;
    }
  }
  const validPassword = await bcrypt.compare(password, userlogin.password);
  if (validPassword) {
    if (!admin) {
      return res.status(200).send({ admin: false, userdata: userlogin });
    } else {
      return res.status(200).send({ admin: true, userdata: userlogin });
    }
  } else {
    return res.status(401).send();
  }
});

app.post("/register", async (req, res) => {
  const foundEmail = await User.find({ email: req.body.email });

  if (foundEmail.length) {
    res.status(409).send();
  } else {
    let user = req.body;
    user._id = new mongoose.Types.ObjectId();

    const hash = await bcrypt.hash(user.password, 12);
    user.password = hash;

    user.payment = false;

    const newUser = new User(user);
    newUser
      .save()
      .then((s) => {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "architchitre@gmail.com",
            pass: "xqizupvsejbfsqxt",
          },
        });
      
        const handlebarOptions = {
          viewEngine: {
            extName: '.html',
            partialsDir: path.resolve('./views'),
            defaultLayout: false
          },
          viewPath: path.resolve('./views'),
          extName: '.handlebars'
        }
      
        transporter.use('compile', hbs(handlebarOptions));
      
        const mailOptions = {
          from: "architchitre@gmail.com",
          to: req.body.email,
          subject: "Welcome to Qwings!",
          template: 'welcome',
          context: {
            name: req.body.name
          }
        };
      
        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            console.log("Email sent: " + info.response);
            res.status(200).send({ userdata: user });
          }
        });
        
      })
      .catch((e) => {
        console.log(e);
        res.json({ status: false, message: "not workking fine", error: e });
      });
  }
});

app.get("/getNotifications", async (req, res) => {
  const notifications = await Notifications.find({
    $or: [
      {
        class: req.query.class,
      },
      {
        class: "everyone",
      },
    ],
  }).sort({ created: -1 });

  res.status(200).send(notifications);
});

app.post('/forgotPassword', async (req, res) => {
  const account = await User.find({email: req.body.email});
  if(account.length){
    //Create OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    //Send by email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "architchitre@gmail.com",
        pass: "xqizupvsejbfsqxt",
      },
    });

    const handlebarOptions = {
      viewEngine: {
        extName: '.html',
        partialsDir: path.resolve('./views'),
        defaultLayout: false
      },
      viewPath: path.resolve('./views'),
      extName: '.handlebars'
    }

    transporter.use('compile', hbs(handlebarOptions));

    const mailOptions = {
      from: "architchitre@gmail.com",
      to: req.body.email,
      subject: "Reset your password",
      template: 'index',
      context: {
        name: account[0].name,
        otp: otp,
        email: req.body.email
      }
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
        res.status(200).send({otp})
      }
    });

  }else{
    res.status(404).send()
  }
});

app.get('/verifyAccount', async (req, res) => {
  console.log(req.query.email);
  const account = await User.find({email: req.query.email});
  if(account.length){
    res.status(200).send({userdata: account[0]});
  }else{
    res.status(404).send();
  }
});

app.post('/updateStreaks', async (req, res) => {
  const user = await User.findOne({_id: req.body.userId});

  if(!user) res.status(404).send()
  else{
    const streaks = user.streaks;
    const lastLoggedIn = new Date(user.lastLoggedIn);
    const today = new Date();

    //If logging in on the same day
    if((lastLoggedIn.getDate() === today.getDate()) && (lastLoggedIn.getMonth() === today.getMonth()) && (lastLoggedIn.getFullYear() === today.getFullYear())){
      res.status(200).send({streaksUpdated: false, streaks: streaks});
    }else{
      lastLoggedIn.setDate(lastLoggedIn.getDate() + 1);
      //If logging in on the next day
      if((lastLoggedIn.getDate() === today.getDate()) && (lastLoggedIn.getMonth() === today.getMonth()) && (lastLoggedIn.getFullYear() === today.getFullYear())){
        await User.findOneAndUpdate({_id: req.body.userId}, {$inc: {streaks: 1}});
        await User.findOneAndUpdate({_id: req.body.userId}, {$set: {lastLoggedIn: today.toDateString()}});
        res.status(200).send({streaksUpdated: true, streaks: streaks+1});
      }else{
        //If logging in after 2 or more days
        await User.findOneAndUpdate({_id: req.body.userId}, {$set: {lastLoggedIn: today.toDateString()}});
        await User.findOneAndUpdate({_id: req.body.userId}, {$set: {streaks: 0}});
        res.status(200).send({streaksUpdated: false, streaks: 0});
      }
    }

    
  }
})

if (process.env.NODE_ENV !== "production") {
  app.use(express.static(path.join(__dirname, "client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "client/build/index.html"));
  });
}

const port = 8081;
app.listen(port, () => {
  console.log(`${port} server running`);
});
