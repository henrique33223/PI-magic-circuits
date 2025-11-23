require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');

const app = express();

const port = process.env.PORT;
 