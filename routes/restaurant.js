const express = require("express");
const router = express.Router();
const { poolPromise } = require("../database/db");
const winston = require("winston");
const Joi = require("joi");
const { appConfig } = require("../database/appConfig");
let middleware = require('../middleware/auth');

router.get("/categories", async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request().query("Select * from dbo.Category");
  res.send(result.recordset);
});

router.get("/coupons", async (req, res) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query("Select Id, Name, Discount, MinimumAmount from dbo.Coupon");
  res.send(result.recordset);
});

router.get("/menuItems", async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .query(`SELECT Menu.Id , Menu.Name, Menu.Image , Menu.Picture, Menu.Price, Cat.Name as categoryName
            FROM [dbo].[MenuItem] Menu INNER JOIN [dbo].[Category] Cat ON Menu.CategoryId = Cat.Id;`);
  res.send(result.recordset);
});

router.get("/shoppingCart/:userId", middleware.checkToken, async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .query(`SELECT shop.Id, shop.ApplicationUserId, shop.MenuItemId, Menu.Name, Menu.Image , Menu.Price, shop.Count
                FROM [dbo].[MenuItem] Menu INNER JOIN [dbo].[ShoppingCart] Shop ON Shop.MenuItemId = Menu.Id where shop.ApplicationUserId = ${req.params.userId}`);
  res.send(result.recordset);
});

router.get("/shoppingCartCount/:userId", middleware.checkToken, async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .query(`select count(*) as cartCount from [dbo].[ShoppingCart]
    where ApplicationUserId = ${req.params.userId}`);
  res.send(result.recordset);
});

router.get("/orders/:userId",middleware.checkToken, async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .query(`SELECT OrderHeader.* , OrderDetails.MenuItemId,   OrderDetails.Count,  OrderDetails.Name, OrderDetails.Price
              FROM [dbo].[OrderHeader] OrderHeader INNER JOIN [dbo].[OrderDetails] [OrderDetails] ON OrderHeader.Id = OrderDetails.OrderId 
              WHERE OrderHeader.UserId = ${req.params.userId} `);
  res.send(result.recordset);
});

router.get("/myOrders/:userId",middleware.checkToken, async (req, res) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .query(`SELECT * FROM [dbo].[OrderHeader]  WHERE UserId = ${req.params.userId} `);
  res.send(result.recordset);
});

router.post("/shoppingCart", middleware.checkToken, async (request, res) => {
  let menuList = request.body;
  console.log("menuItems", menuList)
  const pool = await poolPromise;
  let endResult;
  for (let i = 0; i < menuList.length; i++) {
    const result = await pool.request().query(`SELECT count(Id) as Count
    FROM [dbo].[ShoppingCart] where ApplicationUserId = '${menuList[i].ApplicationUserId}' and 
    MenuItemId = ${menuList[i].MenuItemId}`);
    if(result.recordset[0].Count == 0 && (menuList[i].Count !== 0)){
      let { ApplicationUserId, MenuItemId, Count } = menuList[i];
      var query =
        "Insert into dbo.ShoppingCart(ApplicationUserId, MenuItemId, Count)values" +
        "(@ApplicationUserId, @MenuItemId, @Count)";
       
      const result = await pool
        .request()
        .input("ApplicationUserId", ApplicationUserId)
        .input("MenuItemId", MenuItemId)
        .input("Count", Count)
        .query(query);
    }
    else{
      let { ApplicationUserId, MenuItemId, Count } = menuList[i];
    
      if(Count==0){
        endResult = await pool.request().query(`delete from [dbo].[ShoppingCart]
         where ApplicationUserId = '${ApplicationUserId}' and 
        MenuItemId = ${MenuItemId}`); 
        }
      
      else{
      endResult = await pool.request().query(`Update [dbo].[ShoppingCart]
      set Count = ${Count}
       where ApplicationUserId = '${ApplicationUserId}' and 
      MenuItemId = ${MenuItemId}`); 
      }
      
    }
  }
  res.status(200).send([{"success" : true}]);
});

router.put("/shoppingCart/:cartId", middleware.checkToken, async (req, res) => {
  var query =
    "UPDATE dbo.ShoppingCart SET Count =" +
    req.body.Count +
    "WHERE Id = " +
    req.params.cartId;
  const pool = await poolPromise;
  const result = await pool.request().query(query);
  res.send(result.recordset);
});

router.put("/shopping/:userId", async (req, res) => {
  //let userId = '41fbdfee-1d5f-4290-bbe4-7271ed59a921'
  console.log("req.params.userId", req.params.userId)
  var query = `delete FROM [dbo].[ShoppingCart] where ApplicationUserId = ${req.params.userId}`
  const pool = await poolPromise;
  const result = await pool.request().query(query);
  res.send(result.recordset);
});



router.post("/orderDetails", middleware.checkToken, async (req, res) => {
  // const { error } = validateOrderDetails(req.body);
  let orderList = req.body;
  
  for (let i = 0; i < orderList.length; i++) {
    let { OrderId, MenuItemId, Count, Name, Description, Price } = orderList[i];
    var query =
      "Insert into dbo.OrderDetails(OrderId, MenuItemId, Count, Name, Description, Price)values" +
      "(@OrderId, @MenuItemId, @Count, @Name, @Description, @Price)";
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("OrderId", OrderId)
      .input("MenuItemId", MenuItemId)
      .input("Count", Count)
      .input("Name", Name)
      .input("Description", Description)
      .input("Price", Price)
      .query(query);
  }
  res.status(201).send({"status" : "ok"});
});

router.post("/orderHeader", middleware.checkToken, async (req, res) => {
  const { error } = validateOrderHeaders(req.body);

  if (error) {
    winston.error("Error occurred ", error.message);
    res.status(400).send(error.details[0].message);
    return;
  }

  let {
    UserId,
    OrderDate,
    OrderTotalOriginal,
    OrderTotal,
    PickUpTime,
    CouponCode,
    CouponCodeDiscount,
    Status,
    PaymentStatus,
    Comments,
    PickUpName,
    PhoneNumber,
    TransactionId,
  } = req.body;
  var query = `Insert into dbo.OrderHeader(UserId, OrderDate, OrderTotalOriginal, OrderTotal, PickUpTime, CouponCode, 
        CouponCodeDiscount, Status, PaymentStatus, Comments, PickUpName, PhoneNumber, TransactionId)values
        (@UserId, @OrderDate, @OrderTotalOriginal, @OrderTotal, @PickUpTime, @CouponCode, @CouponCodeDiscount, @Status, @PaymentStatus, @Comments, @PickUpName, @PhoneNumber, @TransactionId)
         SELECT SCOPE_IDENTITY() AS Id;`;
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("UserId", UserId)
    .input("OrderDate", OrderDate)
    .input("OrderTotalOriginal", OrderTotalOriginal)
    .input("OrderTotal", OrderTotal)
    .input("PickUpTime", PickUpTime)
    .input("CouponCode", CouponCode)
    .input("CouponCodeDiscount", CouponCodeDiscount)
    .input("Status", Status)
    .input("PaymentStatus", PaymentStatus)
    .input("Comments", Comments)
    .input("PickUpName", PickUpName)
    .input("PhoneNumber", PhoneNumber)
    .input("TransactionId", TransactionId)
    .query(query);
 
  res.status(201).send({"status" : "ok", data: result.recordset});
});

router.post("/stripePay", async (request, response) => {
  const stripe = require("stripe")(appConfig.stripeSecretKey);
  let data = request.body;
  const body = {
    source: data.tokenId,
    amount: data.amount,
    currency : data.currency
  };
 
  stripe.charges.create(body)
    .then((stripeRes) => {
   // console.log("stripeRes", stripeRes)
      if (stripeRes) {
        console.log("responseeeeeeeeeeeeess", stripeRes.balance_transaction);
        response
          .status(201)
          .send({ data: stripeRes.balance_transaction, status: "success" });
      } else
        response
          .status(201)
          .send({ data: "", status: "failed" });
    })
    .catch((e) => {});
  })


function validateCart(cart) {
  const schema = {
    ApplicationUserId: Joi.string().required(),
    MenuItemId: Joi.number().required(),
    Count: Joi.number().required(),
  };
  return Joi.validate(cart, schema);
}

function validateOrderDetails(order) {
  const schema = {
    OrderId: Joi.number().required(),
    MenuItemId: Joi.number().required(),
    Count: Joi.number().required(),
    Name: Joi.string().required(),
    Description: Joi.string().allow("").optional(),
    Price: Joi.number().required(),
  };
  return Joi.validate(order, schema);
}

function validateOrderHeaders(order) {
  const schema = {
    UserId: Joi.string().required(),
    OrderDate: Joi.date().required(),
    OrderTotalOriginal: Joi.number().required(),
    OrderTotal: Joi.number().required(),
    PickUpTime: Joi.date().required(),
    CouponCode: Joi.string().allow("").optional(),
    CouponCodeDiscount: Joi.number().required(),
    Status: Joi.string().required(),
    PaymentStatus: Joi.string().required(),
    Comments: Joi.string().allow("").optional(),
    PickUpName: Joi.string().allow("").optional(),
    PhoneNumber: Joi.number().required(),
    TransactionId: Joi.string().allow("").optional(),
  };
  return Joi.validate(order, schema);
}

module.exports = router;
