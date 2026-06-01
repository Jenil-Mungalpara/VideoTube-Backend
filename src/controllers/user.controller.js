import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"


const generateAccessAndRefreshTokens = async(userId)=>{

    try{
      const user = await User.findById(userId);
      const accessToken =  user.generateAccessToken()
      const refreshToken = user.generateRefreshToken()
      user.refreshToken = refreshToken;
      await user.save({validateBeforeSave:false})
      return {accessToken,refreshToken}
    } 
    catch(error){
       throw new ApiError(500,"something went wrong while generating refresh and access token")
    }

}


const registerUser = asyncHandler( 
    async(req,res) =>{
        console.log("FILES:", req.files);
        console.log("BODY:", req.body);

       //get user details from frontend
       //validation
       //already exists (using username or email)
       //avatar required and also image 
       //upload them to cloudinary , avatar check 
       //create user object (to store data) ..create entry in db
       //remove password and refreshtoken feild from response
       //check for user creation
       //return response or error

       const { fullName,email,username,password } = req.body
       console.log(email);

       if(
         [fullName,email,username,password].some((field)=>
            field?.trim() === "")
       )
       {
         throw new ApiError(400,"All fields are needed")
       }
    
       const existedUser = await User.findOne({
          $or:[ {username} , {email} ]
       })

       if(existedUser){
          throw new ApiError(409,"user already exists");
       }

       //take avatar and coverimage
       const avatarLocalPath = req.files?.avatar?.[0]?.path
       const coverImageLocalPath = req.files?.coverImage?.[0]?.path
       if(!avatarLocalPath){
        throw new ApiError(400,"avatar is needed ");
       }

       // upload them on cloudinary

       const avatar = await uploadOnCloudinary(avatarLocalPath);
       const coverImage = await uploadOnCloudinary(coverImageLocalPath);

       if(!avatar){
         throw new ApiError(400,"avatar is needed ");
       }

       const user = await User.create({
         fullname:fullName,
         avatar : avatar.url,
         coverImage : coverImage?.url || "", 
         email,
         password,
         username:username.toLowerCase()
       })

       //remove pass and refresh token

       const createdUser = await User.findById(user._id).select(
          "-password -refreshToken"
       )

       if(!createdUser){
        throw new ApiError(500,"something went wrong while registering user");
       }

       //return data 
       return res.status(201).json(
         new ApiResponse(200, createdUser , "user is created successfully")
       )
    }
)

//-----------------------------------------------------------------------

const loginUser = asyncHandler(async (req,res) =>{

     const {email,username,password} = req.body

     if(!username && !email){
      throw new ApiError(400,"username or email is needed");
     }

     const user = await User.findOne({
       $or:[ {username} , {email} ]
     })

     if(!user){
      throw new ApiError(404,"user not found");
     }

     const isPasswordValid = await user.isPasswordCorrect(password);
     
     if(!isPasswordValid){
      throw new ApiError(401,"wrong password");
     }

     const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);
 
     const loggedInUser = await User.findById(user._id).
     select("-password -refreshToken")

     //cannot now modify with frontend (only with backend(server))
     const options = {
        httpOnly : true,
        secure : true
     }

     return res
     .status(200)
     .cookie("accessToken",accessToken,options)
     .cookie("refreshToken",refreshToken,options)
     .json(
         new ApiResponse(200,{
            user : loggedInUser,accessToken,refreshToken
         },
        "User loggedIn Successfully")
     )

})

//--------------------------------------------------------------------------------------------

const logoutUser = asyncHandler(async(req,res) =>{
    await User.findByIdAndUpdate(
       req.user._id,
       {
         $set : {
            refreshToken : undefined
         }
       },
       {
         new:true
       }
    )

    const options = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User loggedout successfully"));
})

//------------------------------------------------------------------------------------------------

const refreshAccessToken = asyncHandler(async(req,res)=>{
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
   
   if(!incomingRefreshToken){
      throw new ApiError(401,"unothorized request")
   }

   try {
      const decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
      )

      const user = await User.findById(decodedToken?.id)
      if(!user){
          throw new ApiError(401,"invalid refresh token")
      }

      if(incomingRefreshToken !== user?.refreshToken){
        throw new ApiError(401,"refreshtoken is expired")
      }
      
      const options ={
        httpOnly : true,
        secure : true
      }

      const {accessToken,newrefreshToken} = await generateAccessAndRefreshTokens(user._id)

      return res
      .status(200)
      .cookie("accessToken",accessToken,options)
      .cookie("refreshToken",newrefreshToken,options)
      .json(
        new ApiResponse(
          200,
          {accessToken,newrefreshToken},
          "Access Token refreshed successfully"
        )
      )
   } 
   catch (error) {
     throw new ApiError(401,error?.message || "invalid ref token")
   }
})

//---------------------------------------------------------------------------

const changeCurrentPassword = asyncHandler(async(req,res) =>{
    const {oldPassword,newPassword} = req.body;
    const user = await User.findById(req.user?._id)

    const isPasswordCorrect=  await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect) {
       throw new ApiError(400,"Invalid old password");
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password is changed"))
})

//-----------------------------------------------------------------------------

const getCurrentUser = asyncHandler(async(req,res) => {
  return res
  .status(200)
  .json(new ApiResponse(200,req.user,"currenty user fetched"))
})

const updateAccountDetails = asyncHandler(async(req,res) => {
  const {fullName,email} = req.body;

  if(!fullName || !email){
     throw new ApiError(400,"All fields are needed");
  }
  
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullName,
        email:email
      }
    },
    {new:true}
  ).select("-password");

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Account details updated"));
})

//--------------------------------------------------------------------------------------

const updateUserAvatar = asyncHandler(async(req,res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
      throw new APiError(400,"avatar file missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new APiError(400,"Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
       req.user?._id,
       {
         $set:{
            avatar:avatar.url
         }
       },
       {new:true}
    ).select("-password")
    
    return res
    .status(200)
    .json(
       new ApiResponse(200,user,"avatar updated")
    )
})

//---------------------------------------------------------------------------

const updateUserCoverImage = asyncHandler(async(req,res) => {
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath){
      throw new APiError(400,"cover image is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url){
        throw new APiError(400,"Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
       req.user?._id,
       {
         $set:{
            coverImage:coverImage.url
         }
       },
       {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(
       new ApiResponse(200,user,"coverImage updated")
    )
})

export {
  registerUser,
  loginUser,logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateUserAvatar,updateUserCoverImage
}