exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if(event.httpMethod === "OPTIONS"){
    return { statusCode: 200, headers, body: "" };
  }

  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = event.headers["authorization"] || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if(!adminSecret || providedToken !== adminSecret){
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({
      name: "icc-bookings",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN
    });
    const indexData = await store.get("booking-index");
    const bookingIds = indexData ? JSON.parse(indexData) : [];

    const bookings = [];
    for(const id of bookingIds){
      try{
        const data = await store.get("booking-"+id);
        if(data) bookings.push(JSON.parse(data));
      } catch(e){ /* skip corrupt entries */ }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ bookings, total: bookings.length })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ bookings: [], total: 0, error: e.message })
    };
  }
};
