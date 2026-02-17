const { GoogleGenerativeAI } = require("@google/generative-ai");

// حط الـ API Key بتاعك هنا مباشرة للتجربة
const API_KEY = "AIzaSyC8K28hDxBBwKbgoK5ku1Vhd2JEuijIOxU";

async function runTest() {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    
    // هنجرب نحدد الموديل بالاسم الكامل عشان نتخطى مشكلة الـ 404
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    console.log("--- Starting Gemini Test ---");
    
    const prompt = "Say 'Hello World' if you are working correctly.";

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log("Response from Gemini:", text);
    console.log("--- Test Passed! ---");

  } catch (error) {
    console.error("--- Test Failed ---");
    console.error("Error Message:", error.message);
    if (error.stack) {
      console.error("Stack Trace:", error.stack);
    }
  }
}

runTest();