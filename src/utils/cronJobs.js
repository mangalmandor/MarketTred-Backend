import cron from 'node-cron';
import Product from '../models/Product.js'; 

const performCleanup = async () => {
    try {
        console.log("Running manual cleanup test...");
        const expiryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await Product.deleteMany({ updatedAt: { $lt: expiryDate } });
        console.log(`Cleanup successful. Deleted ${result.deletedCount} items.`);
    } catch (error) {
        console.error("Cron Job Failed:", error);
    }
};

const initItemsCleanup = () => {
    performCleanup(); 
    cron.schedule('0 0 * * *', performCleanup);
};

export default initItemsCleanup;
