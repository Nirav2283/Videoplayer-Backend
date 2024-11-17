import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from'../utils/ApiError.js';
import { User } from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const generateAccessAndRefreshTokens = async(userId) => {
    try{
        const user = await User.findById(userID);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave : false});

        return {accessToken , refreshToken}

    }catch(error){
        throw new ApiError(500 , "something went wrong while Generating Refresh and access token")
    }
}

const registerUser = asyncHandler ( async (req,res) =>{
    const { fullName , email , username , password } = req.body;
    if(
        [fullName, email, username, password].some((field)=>field?.trim() === "")
    ){
        throw new ApiError(400, "all fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{username} , {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImagePath = req.files?.coverImage[0]?.path;

    console.log(req.files);

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImagePath);

    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    const user = await User.create({
        fullName,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        email,
        password,
        username : username.toLowerCase()
    })

    const createdUser= await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
   


})

const loginUser = asyncHandler(async (req , res) => {
    const{email , username , password} = req.body;

    if(!username || !email){
        throw new ApiError(400 , "Username or email is Required")
    }

    const user = await User.findOne({
        $or : [{username} , {email}]
    }) // advance technique (it will get either username or email)

    if(!user){
        throw new ApiError(404 , "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401 , "Invalid Password");
    }

    const {accessToken , refreshToken} =  await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200).cookie("accessToken" , accessToken , options)
    .cookie("refreshToken" , refreshToken , options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser , accessToken,
                refreshToken
            },
            "User Logged in SucessFully"
        )
    )
});

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})






export { registerUser , loginUser , logoutUser}