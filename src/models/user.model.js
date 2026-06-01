import mongoose,{Schema} from "mongoose";
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"

const userSchema = new Schema(
     {
        username: {
            type:String,
            required:true,
            unique:true,
            lowercase:true,
            trim:true,
            index:true
        },
        email: {
            type:String,
            required:true,
            unique:true,
            lowercase:true,
            trim:true,
        },
        fullname: {
            type:String,
            required:true,
            trim:true,
            index:true
        },
        avatar:{
            type:String,  //cloundnary service url use krsu
            required:true,
        },
        coverImage:{
            type:String,
        },
        watchHistory:[
            {
                type:Schema.Types.ObjectId,
                ref:"Video"
            }
        ],
        password:{
            type:String,
            required:[true,'Password is needed'],
        },
        refreshToken:{
            type:String,
        }

     },
     {
        timestamps:true
     }
)


//encypt password ----------------------------------------------------------------

//encypt password ----------------------------------------------------------------
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    // Password ko hash karo (bcrypt library use karke)
    this.password = await bcrypt.hash(this.password, 10);
})

userSchema.methods.isPasswordCorrect = async function (pass){
    return await bcrypt.compare(pass, this.password);
}

//both are jwt token --------------------------------------------------------------

userSchema.methods.generateAccessToken = function(){
    return jwt.sign(
        {
            _id:this._id,
            email:this.email,
            username:this.username,
            fullname:this.fullname
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn:process.env.ACCESS_TOKEN_EXPIRY
        }
    )
        
}

userSchema.methods.generateRefreshToken = function(){
     return jwt.sign(
        {
            _id:this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn:process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}






export const User = mongoose.model("User",userSchema);