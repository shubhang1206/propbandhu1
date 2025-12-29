// properties.js
const properties = [
  {
    "id": 1,
    "title": "Luxury Villa in Noida",
    "image": "Desktop-DMELDU-S.jpg",
    "location": "Noida, Sector 150",
    "price": "₹2.5 Cr",
    "featured": true,
    "popular": true,
    "rating": 4.8,
    "short_description": "Premium 4 BHK villa with modern amenities",
    "tags": ["Villa", "Luxury", "4 BHK"]
  },
  {
    "id": 2,
    "title": "3 BHK Apartment",
    "image": "/images/property2.jpg",
    "location": "Greater Noida West",
    "price": "₹1.2 Cr",
    "featured": true,
    "popular": true,
    "rating": 4.5,
    "short_description": "Modern 3 BHK apartment with great view",
    "tags": ["Apartment", "3 BHK", "Modern"]
  },
  {
    "id": 3,
    "title": "Commercial Space",
    "image": "/images/property3.jpg",
    "location": "Delhi",
    "price": "₹3 Cr",
    "featured": false,
    "popular": true,
    "rating": 4.7,
    "short_description": "Prime commercial space in business district",
    "tags": ["Commercial", "Office", "Retail"]
  },
  {
    "id": 4,
    "title": "2 BHK Luxury Flat",
    "image": "/images/property4.jpg",
    "location": "Ghaziabad",
    "price": "₹85 Lakh",
    "featured": true,
    "popular": true,
    "rating": 4.3,
    "short_description": "Luxury 2 BHK with swimming pool",
    "tags": ["Flat", "2 BHK", "Luxury"]
  },
  {
    "id": 5,
    "title": "Penthouse in Gurgaon",
    "image": "/images/property5.jpg",
    "location": "Gurgaon",
    "price": "₹4.2 Cr",
    "featured": true,
    "popular": false,
    "rating": 4.9,
    "short_description": "Premium penthouse with panoramic view",
    "tags": ["Penthouse", "Luxury", "View"]
  }
];

// Export for Node.js/Express
if (typeof module !== 'undefined' && module.exports) {
  module.exports = properties;
}

// For browser use
if (typeof window !== 'undefined') {
  window.propertiesData = properties;
}