import { Schema, model } from "mongoose";

export interface AccountDocument {
  email: string;
  password: string;
  mexcAPIKey: string;
  mexcSecretKey: string;
}

const accountSchema = new Schema<AccountDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    mexcAPIKey: {
      type: String,
      default: ""
    },
    mexcSecretKey: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

export const Account = model<AccountDocument>("Account", accountSchema);
