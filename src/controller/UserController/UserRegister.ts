import { Request, Response } from "express";
import {
  validateBeforeRegister,
  validateBeforeActivate,
} from "../../validators/UserValidator";
import { User, IUser } from "../../model/User";
import { v4 } from "uuid";
import { throwError } from "../../utils/throwError";
import { GeneralError } from "../../errors/GeneralError";
import { sendEmailHTML } from "../../services/EmailService";
import { generateSalt, signJwt, verifyJwt } from "../../services/AuthService";
import { throwSuccess } from "../../utils/throwSuccess";
import { readHTMLFile, fillTemplate } from "../../services/FileService";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = await validateBeforeRegister(req, res);
    const hashedPassword = await generateSalt(password);
    const newUserModel = <IUser>{
      email,
      password: hashedPassword,
      uuid: v4(),
    };
    new User(newUserModel)
      .save()
      .then(() => {
        throwSuccess("Successfully registered user.", res);
        doPostRegisterSteps(email, newUserModel.uuid, newUserModel.id);
      })
      .catch((err: Error) => {
        throw new GeneralError(500, err.message, err.name);
      });
  } catch (ex) {
    throwError(ex, res);
  }
};

const doPostRegisterSteps = async (email: string, uuid: string, id: string) => {
  const html = await readHTMLFile("src/emails/RegisterUser_Template.html");
  const payload = {
    id,
    email,
    uuid,
  };

  const activationCode = await signJwt(payload, 600);
  const registerTemplateReplacement = {
    email,
    activationCode,
  };

  const template = fillTemplate(html, registerTemplateReplacement);
  sendEmailHTML("Please activate your account", email, template);
};

export const activateUser = async (req: Request, res: Response) => {
  try {
    const { email, activationCode } = await validateBeforeActivate(req, res);
    const { activation } = await verifyJwt(activationCode).catch(() => {
      throw new GeneralError(400, "Activation code is invalid", "BAD_REQUEST");
    });

    if (!!activation) {
      const user = await User.findOne({ email }).select("+activated");
      if (!user) {
        throw new GeneralError(404, "User not found", "NO_RECORD");
      } else {
        user.activated = true;
        user.save();
        throwSuccess("Successfully activated user.", res);
      }
    }
  } catch (ex) {
    throwError(ex, res);
  }
};
