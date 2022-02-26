const http = require("http");
const he = require("he")

const parser = require("fast-xml-parser");
const axios = require("axios");
const env = require("./env-variables")

const soapRequest = require("easy-soap-request")

const options = {
    attributeNamePrefix: "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: true,
    ignoreNameSpace: true,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: false,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: false,
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),
    tagValueProcessor: (val, tagName) => he.decode(val),
    stopNodes: ["parse-me-as-string"]
};


const bundleIDMapping = {
    10: "1.6",
    11: "3.2",
    12: "5",
    13: "7",
    14: "12",
    15: "30",
    16: "45",
    17: "65",
    18: "125",
    19: "185",
    20: "Night Pack",
    21: "Unlimited Bundle",
    31: "Always ON Standard",
    32: "Always On Super",
    33: "Always ON Ultra",
    34: "Always ON Starter",
    35: "Always ON Streamer",
    36: "Always ON Lite",
    37: "Always ON Maxi",
    38: "Always ON One Year",
    40: "SME Lite",
    41: "SME Standard",
    42: "SME Starter",
    43: "SME Super",
    44: "SME Ultra",
    50: "Ride ON Lite",
    51: "Ride ON",
    60: "Bolt Lite",
    61: "Bolt",
    70: "Weekend(10.5GB)",
    71: "MoneyHeistPlus(Doughman)",
    101: "BingeXtra",
    102: "Zoom",
    103: "Work Streak",
    104: "After Hours"
};

const port = 7100
const hostname = "172.25.33.141"

http.createServer((req, res) => {
    let alldata = ""
    req.on("data", chunk => {


        alldata += chunk;


    });

    req.on("end", async () => {
        try {
            let jsonObject = parser.parse(alldata, options);
            let soapBody = jsonObject.Envelope.Body.Operation.inputValues;
            let opCode = soapBody.opCode.toString()
            let subscriberNumber = soapBody.callingSubscriber.toString()
            let phoneContact = soapBody.phoneContact.toString()
            if (opCode === "1") {
                const reservations = await getINReservations(subscriberNumber)
                if (reservations) {
                    const data = reservations.toString().split(":")
                    const [scpId, callId] = data
                    await deleteINReservations(subscriberNumber, scpId, callId)
                    console.log("Success: ", scpId, callId)
                }
                return res.end("success")
            } else if (opCode === "2") {
                const bundleId = await getBundlePurchased(subscriberNumber)
                if (!bundleId) return res.end("success")
                switch (bundleId) {
                    case 71:
                        const code = generateCode()
                        const partnerContact = '233204629983'
                        let smsContent = `Dear Customer, thank you for purchasing our Money Heist bundle valid for 6hrs. Call 0204629983 to redeem your doughnut with code ${code}. Offer is valid for 24hrs`
                        try {
                            await pushSMS(smsContent, partnerContact)
                            await pushSMS(smsContent, phoneContact)
                            return res.end("success")

                        } catch (error) {
                            console.log(error)
                            return res.end("success")
                        }


                }
                res.end("success")

            } else if (opCode === "3") {
                await changeAcctSTATE(subscriberNumber)
                return res.end("success")

            } else {
                return res.end("success")
            }

        } catch (error) {
            console.log(error);
            res.end("success")

        }

    });


}).listen(port, hostname, () => {
    console.log(`App listening on http://${hostname}:${port}`)
})

async function pushSMS(smsContent, to_msisdn) {
    const url = "http://api.hubtel.com/v1/messages/";
    const headers = {
        "Content-Type": "application/json",
        Authorization: env.SMS_AUTH
    };
    let messagebody = {
        Content: smsContent,
        FlashMessage: false,
        From: "Surfline",
        To: to_msisdn,
        Type: 0,
        RegisteredDelivery: true
    };

    await axios.post(url, messagebody, {headers: headers})


}

async function getBundlePurchased(subscriberNumber) {

    try {
        const soapUrl = "http://172.25.39.13:3004";
        const soapHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'urn:CCSCD1_QRY',
        };

        let getBalancexml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD1_QRY>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:LIST_TYPE>BALANCE</pi:LIST_TYPE>
         <pi:WALLET_TYPE>Primary</pi:WALLET_TYPE>
         <pi:BALANCE_TYPE>internalBdlId Count</pi:BALANCE_TYPE>
      </pi:CCSCD1_QRY>
   </soapenv:Body>
</soapenv:Envelope>`;

        const {response} = await soapRequest({url: soapUrl, headers: soapHeaders, xml: getBalancexml, timeout: 6000}); // Optional timeout parameter(milliseconds)
        const {body} = response;
        let jsonObj = parser.parse(body, options);
        const soapResponseBody = jsonObj.Envelope.Body;
        if (soapResponseBody.CCSCD1_QRYResponse && parseInt(soapResponseBody.CCSCD1_QRYResponse.BALANCE.toString()) > 0) {
            return parseInt(soapResponseBody.CCSCD1_QRYResponse.BALANCE.toString());
        } else return null;

    } catch (error) {
        console.log(error);
        return null;

    }

}

async function topUpBonusData(subscriberNumber, bonus_details) {

    let bonus_data = bonus_details.bonus_data_KB
    let bonus_validity = bonus_details.bonus_validity

    try {
        const soapUrl = "http://172.25.39.13:3004";
        const soapHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'urn:CCSCD1_QRY',
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD3_RCH>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:RECHARGE_TYPE>Custom</pi:RECHARGE_TYPE>
         <pi:REFERENCE>Bonus Data Allocation</pi:REFERENCE>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:AMOUNT>${bonus_data}</pi:AMOUNT>
         <pi:BALANCE_EXPIRY>${bonus_validity}</pi:BALANCE_EXPIRY>
         <pi:MODE>3</pi:MODE>
         <pi:BALANCE_TYPE>Bonus Data</pi:BALANCE_TYPE>
      </pi:CCSCD3_RCH>
   </soapenv:Body>
</soapenv:Envelope>`;

        const {response} = await soapRequest({url: soapUrl, headers: soapHeaders, xml: xmlBody, timeout: 10000}); // Optional timeout parameter(milliseconds)
        const {body} = response;

        let jsonObj = parser.parse(body, options);
        const soapResponseBody = jsonObj.Envelope.Body;
        if (soapResponseBody.CCSCD3_RCHResponse && soapResponseBody.CCSCD3_RCHResponse.AUTH) {
            return "success"
        } else return null;

    } catch (error) {
        console.log(error);
        return null;

    }

}

async function updateTAG(subscriberNumber) {


    try {
        const soapUrl = "http://172.25.39.13:3004";
        const soapHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'urn:CCSCD1_QRY',
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD9_CHG>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:TAG>NewActivateTag</pi:TAG>
         <pi:VALUE>disallow</pi:VALUE>
      </pi:CCSCD9_CHG>
   </soapenv:Body>
</soapenv:Envelope>`;

        const {response} = await soapRequest({url: soapUrl, headers: soapHeaders, xml: xmlBody, timeout: 10000}); // Optional timeout parameter(milliseconds)
        const {body} = response;

        let jsonObj = parser.parse(body, options);
        const soapResponseBody = jsonObj.Envelope.Body;
        if (soapResponseBody.CCSCD9_CHGResponse && soapResponseBody.CCSCD9_CHGResponse.AUTH) {
            return "success"
        } else return null;

    } catch (error) {
        console.log(error);
        return null;

    }

}

async function getINReservations(subscriberNumber) {

    try {
        const soapUrl = "http://172.25.39.13:3003";
        const soapHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'urn:CCSCD1_QRY',
        };

        let xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSRM1_QRY>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:WALLET_TYPE>Primary</pi:WALLET_TYPE>
      </pi:CCSRM1_QRY>
   </soapenv:Body>
</soapenv:Envelope>`;

        const {response} = await soapRequest({url: soapUrl, headers: soapHeaders, xml: xml, timeout: 6000}); // Optional timeout parameter(milliseconds)
        const {body} = response;
        let jsonObj = parser.parse(body, options);
        const soapResponseBody = jsonObj.Envelope.Body;
        if (soapResponseBody.CCSRM1_QRYResponse && soapResponseBody.CCSRM1_QRYResponse.RESERVATIONS) {
            return soapResponseBody.CCSRM1_QRYResponse.RESERVATIONS;
        } else return null;

    } catch (error) {
        console.log(error);
        return null;

    }

}

async function deleteINReservations(subscriberNumber, scpId, callId) {


    const soapUrl = "http://172.25.39.13:3003";
    const soapHeaders = {
        'User-Agent': 'NodeApp',
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'urn:CCSCD1_QRY',
    };

    let xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSRM1_DEL>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:SCP_ID>${scpId}</pi:SCP_ID>
         <pi:CALL_ID>${callId}</pi:CALL_ID>
         <pi:WALLET_TYPE>Primary</pi:WALLET_TYPE>
         <pi:OPERATION>1</pi:OPERATION>
      </pi:CCSRM1_DEL>
   </soapenv:Body>
</soapenv:Envelope>`;

    await soapRequest({url: soapUrl, headers: soapHeaders, xml: xml, timeout: 6000}); // Optional timeout parameter(milliseconds)


}

async function changeAcctSTATE(subscriberNumber) {


    try {
        const soapUrl = "http://172.25.39.13:3004";
        const soapHeaders = {
            'User-Agent': 'NodeApp',
            'Content-Type': 'text/xml;charset=UTF-8',
            'SOAPAction': 'urn:CCSCD1_QRY',
        };

        let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pi="http://xmlns.oracle.com/communications/ncc/2009/05/15/pi">
   <soapenv:Header/>
   <soapenv:Body>
      <pi:CCSCD1_CHG>
         <pi:username>${env.PI_USER}</pi:username>
         <pi:password>${env.PI_PASS}</pi:password>
         <pi:MSISDN>${subscriberNumber}</pi:MSISDN>
         <pi:STATUS>A</pi:STATUS>
         <pi:WALLET_EXPIRY_DATE></pi:WALLET_EXPIRY_DATE>
      </pi:CCSCD1_CHG>
   </soapenv:Body>
</soapenv:Envelope>`;

        const {response} = await soapRequest({
            url: soapUrl,
            headers: soapHeaders,
            xml: xmlBody,
            timeout: 6000
        });

        const {body} = response;

        let jsonObj = parser.parse(body, options);

        if (jsonObj.Envelope.Body.CCSCD1_CHGResponse && jsonObj.Envelope.Body.CCSCD1_CHGResponse.AUTH) {
            return "success"
        } else return null

    } catch (error) {
        console.log(error);
        return null;

    }

}

function generateCode() {
    const STRING = "123456789ABCDEFGHJK";
    const length = STRING.length;
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += STRING.charAt(Math.floor(Math.random() * length))
    }

    return code;

}

