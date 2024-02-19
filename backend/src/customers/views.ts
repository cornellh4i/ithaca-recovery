import { Router } from "express";
import mongoose from "mongoose";
import CustomerController from "./controllers";

// Note: we should use a try/catch to choose successJson or errorJson for responses
// this has been left out of this snippet for brevity
import { successJson, errorJson } from "../utils/jsonResponses";

const customerRouter = Router();

customerRouter.get("/", async (req, res) => {
  // #swagger.tags = ['Customers']
  res.status(200).send(await CustomerController.getCustomers());
});

customerRouter.get("/:id", async (req, res) => {
  // #swagger.tags = ['Customers']
  const id = new mongoose.Types.ObjectId(req.params.id);
  res
    .status(200)
    .send(successJson(await CustomerController.getCustomerById(id)));
});

customerRouter.post("/", async (req, res) => {
  // #swagger.tags = ['Customers']
  const { name, age, title, company } = req.body;
  res
    .status(201)
    .send(
      successJson(
        await CustomerController.insertCustomer(name, age, title, company)
      )
    );
});

customerRouter.put("/updateName/:id", async (req, res) => {
  // #swagger.tags = ['Customers']
  const id = new mongoose.Types.ObjectId(req.params.id);
  const name = req.body.name;
  res
    .status(200)
    .send(successJson(await CustomerController.updateName(id, name)));
});

customerRouter.post("/resetAges", async (req, res) => {
  // #swagger.tags = ['Customers']
  const numResets = await CustomerController.resetAges();
  res.status(200).send(successJson(numResets));
});

export default customerRouter;
