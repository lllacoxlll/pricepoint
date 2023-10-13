"use server"

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractPrice, extractCurrency, extractDescription } from '../utils';

async function fetchData(url: string, options: any): Promise<string> {
    const response = await axios.get(url, options);
    return response.data;
}

async function fetchDataWithRetry(url: string, options: any, attempts: number = 3): Promise<string> {
    while (attempts-- > 0) {
        try {
            let data = await fetchData(url, options);
            if (data) return data;
        } catch (error) {
            console.error(`Failed to fetch data. Retries left: ${attempts}`, error);
            await new Promise(res => setTimeout(res, 1000));  // Wait for 1 second before retrying
        }
    }
    throw new Error('Failed to fetch data after multiple attempts.');
}

export async function scrapeAmazonProduct(url: string) {
    if (!url) return;

    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
        "Mozilla/5.0 (X11; CrOS x86_64 8172.45.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.64 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.111 Safari/537.36",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:15.0) Gecko/20100101 Firefox/15.0.1",
        "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 10; VOG-L29) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone14,6; U; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/602.1.50 (KHTML, like Gecko) Version/10.0 Mobile/19E241 Safari/602.1",
        "Mozilla/5.0 (Linux; Android 11; Lenovo YT-J706X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36"
    ]

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    // BrightData proxy configuration
    const username = String(process.env.BRIGHT_DATA_USERNAME);
    const password = String(process.env.BRIGHT_DATA_PASSWORD);
    const port = 22225;
    const session_id = (1000000 * Math.random()) | 0;
    const options = {
        headers: {
            'User-Agent': randomUserAgent,
        },
        auth: {
            username: `${username}-session-${session_id}`,
            password,
        },
        host: 'brd.superproxy.io',
        port,
        rejectUnauthorized: false,
    }

    try {
        // Fetch the product page
        // const response = await axios.get(url, options);
        // const $ = cheerio.load(response.data);
        const htmlData = await fetchDataWithRetry(url, options);
        const $ = cheerio.load(htmlData);

        // console.log(response.data);
        // Extract the product title
        const title = $('#productTitle').text().trim();

        const currentPrice = extractPrice(
            $('.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay > .a-offscreen:first'),
            $('.a-price.a-text-price.a-size-medium.apexPriceToPay > .a-offscreen:first'),
            // $('#snsDetailPagePrice > #sns-base-price')
            $('#sns-base-price'),
            $('.priceToPay span.a-price-whole'),
            $('a.size.base.a-color-price'),
            $('.a-button-selected .a-color-base')
        );

        const originalPrice = extractPrice(
            $('.aok-relative .a-price.a-text-price > .a-offscreen:first'),
            $('#priceblock_ourprice'),
            $('.a-price.a-text-price span.a-offscreen'),
            $('#listPrice'),
            $('#priceblock_dealprice'),
            $('.a-size-base.a-color-price')
        );

        const outOfStock = $('#availability span').text().trim().toLowerCase() === 'currently unavailable';

        const images = 
            $('#imgBlkFront').attr('data-a-dynamic-image') || 
            $('#landingImage').attr('data-a-dynamic-image') ||
            $('#landingImage').attr('src') ||
            $('#landingImage').attr('data-old-hires') ||
            '{}';

            // console.log("imgBlkFront:", $('#imgBlkFront').attr('data-a-dynamic-image'));
            // console.log("landingImage dynamic:", $('#landingImage').attr('data-a-dynamic-image'));
            // console.log("landingImage src:", $('#landingImage').attr('src'));
            // console.log("landingImage old hires:", $('#landingImage').attr('data-old-hires'));
            


        // let largestImageURL = '';

        // if (typeof image === 'string' && image.startsWith('{')) { // Check if it's a valid JSON string
        //     const imageMapping = JSON.parse(image);
        //     let largestWidth = 0;
            
        //     for (const [url, dimensions] of Object.entries(imageMapping)) {
        //         const width = (dimensions as number[])[0];
        //         if (width > largestWidth) {
        //             largestWidth = width;
        //             largestImageURL = url;
        //         }
        //     }
        // }

        const imageUrls = Object.keys(JSON.parse(images));

        const currency = extractCurrency($('.a-price-symbol'));
            
        // const discountRate = $('.savingsPercentage').first().text().replace(/[-%]/g, "");
        let discountRate = "";

        if ($('.savingsPercentage').length > 0) {
            discountRate = $('.savingsPercentage').first().text().replace(/[-%]/g, "").trim();
        } else {
            discountRate = "0";
        }

        const description = extractDescription($);


        // console.log({title, currentPrice, originalPrice, outOfStock, imageUrls, currency, discountRate});
        const data = {
            url,
            currency: currency || $,
            image: imageUrls[0],
            title,
            currentPrice: Number(currentPrice) || Number(originalPrice),
            originalPrice: Number(originalPrice) || Number(currentPrice),
            priceHistory: [],
            discountRate: Number(discountRate),
            category: 'category',
            reviewsCount: 100,
            stars: 4.5,
            isOutOfStock: outOfStock,
            description,
            lowestPrice: Number(currentPrice) || Number(originalPrice),
            highestprice: Number(originalPrice) || Number(currentPrice),
            average: Number(currentPrice) || Number(originalPrice)
        }

        // console.log(data);
        return data;
    } catch (error: any) {
        throw new Error(`Failed to scrape product: ${error.message}`)
    }
}