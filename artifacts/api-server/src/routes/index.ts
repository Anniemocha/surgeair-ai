import { Router, type IRouter } from "express";
import healthRouter from "./health";
import surgeAirRouter from "./surgeair";

const router: IRouter = Router();

router.use(healthRouter);
router.use(surgeAirRouter);

export default router;
