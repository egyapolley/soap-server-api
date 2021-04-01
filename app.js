const http = require("http");
const he = require("he")

const parser = require("fast-xml-parser");
const axios = require("axios");

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
    10:"1.6",
    11:"3.2",
    12:"5",
    13:"7",
    14:"12",
    15:"30",
    16:"45",
    17:"65",
    18:"120",
    19:"180",
    20:"Night Pack",
    21:"Unlimited Bundle",
    31:"Always ON Standard",
    32:"Always On Super",
    33:"Always ON Ultra",
    34:"Always ON Starter",
    35:"Always ON Streamer",
    36:"Always ON Lite",
    37:"Always ON Maxi",
    40:"SME Lite",
    41:"SME Standard",
    42:"SME Starter",
    43:"SME Super",
    44:"SME Ultra",
    50:"Ride ON Lite",
    51:"Ride ON",
    60:"Bolt Lite",
    61:"Bolt",
    70:"Weekend(10.5GB)"
};

const port =7100
const hostname="172.25.33.141"

http.createServer((req, res) => {
    let alldata = ""
    req.on("data", chunk => {


        alldata += chunk;
        console.log(alldata)

    });

    req.on("end", async () => {

        try {
            let jsonObject = parser.parse(alldata, options);
            let soapBody = jsonObject.Envelope.Body.Operation.inputValues;
            console.log(soapBody)
            let opCode = soapBody.opCode.toString()
            let subscriberNumber=soapBody.callingSubscriber.toString()
            let phoneContact=soapBody.phoneContact.toString()

            if (opCode === "1"){
                getBundlePurchased(subscriberNumber)
                    .then(bundleId =>{
                        if (bundleId){
                            const bonus_details =getBonusAmount(bundleId)
                            if (bonus_details){
                                const result =topUpBonusData(subscriberNumber,bonus_details)
                                if (result){
                                    updateTAG(subscriberNumber).then(result =>{
                                        if (result){
                                            let smsContent=`CONGRATS!, You have just received ${bonus_details.bonus_data_MB}MB Bonus data for purchasing a ${bonus_details.data_purchased}GB bundle. Bonus data is valid for ${bonus_details.bonus_validity}days. Thank you`
                                            pushSMS(smsContent,phoneContact,res)

                                        }
                                    }).catch(error =>{
                                        console.log(error)
                                        let smsContent=`CONGRATS!, You have just received ${bonus_details.bonus_data_MB}MB Bonus data for purchasing a ${bonus_details.data_purchased}GB bundle. Bonus data is valid for ${bonus_details.bonus_validity}days. Thank you`
                                        pushSMS(smsContent,phoneContact,res)
                                    })
                                } else return res.end("success")

                            } else  return res.end("success")
                        } else  return  res.end("success")
                    })
            }else {
                 return res.end("success")
            }


        }catch (error) {
            console.log(error);
            res.end("success")

        }

    });


}).listen(port,hostname, () => {
    console.log(`App listening on http://${hostname}:${port}`)
})

function pushSMS(smsContent, to_msisdn, res) {
    const url = "http://api.hubtel.com/v1/messages/";
    const headers = {
        "Content-Type": "application/json",
        Authorization: "Basic Y3BlcGZ4Z2w6Z3Rnb3B0c3E="
    };
    let messagebody = {
        Content: smsContent,
        FlashMessage: false,
        From: "Surfline",
        To: to_msisdn,
        Type: 0,
        RegisteredDelivery: true
    };

    axios.post(url, messagebody,
        {headers: headers})
        .then(function (response) {
            console.log(response.data);
            res.end("success")

        }).catch(function (error) {
        console.log(error);
        res.end("success")

    })

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
         <pi:username>admin</pi:username>
         <pi:password>admin</pi:password>
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
           return  parseInt(soapResponseBody.CCSCD1_QRYResponse.BALANCE.toString());
        } else  return null;

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
         <pi:username>admin</pi:username>
         <pi:password>admin</pi:password>
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
         <pi:username>admin</pi:username>
         <pi:password>admin</pi:password>
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

function getBonusAmount(bundleId) {
    if (bundleId >= 10 && bundleId <= 19){
        let bonus_data_KB, bonus_data_MB

        let data_purchased = bundleIDMapping[bundleId],bonus_validity

        if (bundleId <= 14 ){
            bonus_data_KB =Math.trunc((parseFloat(data_purchased)/2)*1048576).toString()
            bonus_data_MB = Math.trunc(bonus_data_KB/1024).toString()
            bonus_validity="15"

        }else {
            bonus_data_KB =Math.trunc((parseFloat(data_purchased))*1048576).toString()
            bonus_data_MB = Math.trunc(bonus_data_KB/1024).toString()
            bonus_validity="30"
        }
        return  {
            bonus_data_KB,
            bonus_data_MB,
            data_purchased,
            bonus_validity
        }

    }else return null

}