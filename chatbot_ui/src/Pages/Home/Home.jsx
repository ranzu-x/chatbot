import { PhoneIcon, EnvelopeIcon, MapPinIcon, HeartIcon, ShieldCheckIcon, BeakerIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import Home2 from '../../Components/Common/Home2/Home2';

// --- Reusable Sub-Components ---

// Header/Navigation Bar
const Header = () => (
  <header className="bg-white shadow-sm sticky top-0 z-50">
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center py-4">
      <div className="text-2xl font-bold text-indigo-600">
        <a href="#">HealthCare</a>
      </div>
      <div className="hidden md:flex space-x-8">
        <a href="#" className="text-gray-600 hover:text-indigo-600 font-medium">Home</a>
        <a href="#" className="text-gray-600 hover:text-indigo-600 font-medium">About Us</a>
        <a href="#" className="text-gray-600 hover:text-indigo-600 font-medium">Services</a>
        <a href="#" className="text-gray-600 hover:text-indigo-600 font-medium">Doctors</a>
        <a href="#" className="text-gray-600 hover:text-indigo-600 font-medium">Contact</a>
      </div>
      <a href="#" className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 transition">
        Book Appointment
      </a>
    </nav>
  </header>
);

// Service Card for the "Our Services" section
const ServiceCard = ({ icon, title, description }) => (
  <div className="bg-white p-6 rounded-lg shadow-lg text-center hover:shadow-xl transition-shadow">
    <div className="flex justify-center items-center h-16 w-16 bg-indigo-100 rounded-full mx-auto mb-4">
      {icon}
    </div>
    <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

// --- Main Home Component ---

const Home = () => {
  return (
    // <Home2></Home2>
    <div className="bg-gray-50">
      {/* <Header /> */}

      <main>
        {/* Section 1: Hero Section */}
        <section className="relative bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
            <div className="md:w-1/2">
              <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                Providing the Best <span className="text-indigo-600">Medical Care</span> for You
              </h1>
              <p className="mt-4 text-lg text-gray-600">
                Our team of expert doctors is dedicated to your health and well-being. Trust us to provide the highest quality care.
              </p>
              <div className="mt-8">
                <a href="#" className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-md hover:bg-indigo-700 transition text-lg">
                  Find a Doctor
                </a>
              </div>
            </div>
          </div>
          {/* Add a high-quality background image for a hospital setting */}
          <div
            className="hidden md:block absolute top-0 right-0 h-full w-1/2 bg-cover bg-center"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=2070&auto=format&fit=crop')" }}>
          </div>
        </section>

        {/* Section 2: Our Services */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-gray-900">Our Medical Services</h2>
              <p className="mt-4 text-lg text-gray-600">We offer a wide range of specialized medical services.</p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <ServiceCard 
                icon={<HeartIcon className="h-8 w-8 text-indigo-600" />}
                title="Cardiology"
                description="Expert care for heart and vascular diseases."
              />
              <ServiceCard 
                icon={<UserGroupIcon className="h-8 w-8 text-indigo-600" />}
                title="Pediatrics"
                description="Compassionate healthcare for children."
              />
              <ServiceCard 
                icon={<ShieldCheckIcon className="h-8 w-8 text-indigo-600" />}
                title="Emergency Care"
                description="24/7 emergency services for critical situations."
              />
              <ServiceCard 
                icon={<BeakerIcon className="h-8 w-8 text-indigo-600" />}
                title="Diagnostics"
                description="Advanced diagnostic and laboratory services."
              />
            </div>
          </div>
        </section>

        {/* Section 3: Why Choose Us */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">Why Choose HealthCare?</h2>
            <p className="mt-4 text-lg text-gray-600">
              We are committed to providing a superior patient experience.
            </p>
            <div className="mt-12 grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center">
                <div className="p-4 bg-indigo-100 rounded-full">
                  <UserGroupIcon className="h-10 w-10 text-indigo-600" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-800">Expert Doctors</h3>
                <p className="mt-2 text-gray-600">Our team consists of highly skilled and experienced medical professionals.</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="p-4 bg-indigo-100 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-800">24/7 Support</h3>
                <p className="mt-2 text-gray-600">We provide round-the-clock medical assistance and support.</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="p-4 bg-indigo-100 rounded-full">
                  <ShieldCheckIcon className="h-10 w-10 text-indigo-600" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-800">Modern Technology</h3>
                <p className="mt-2 text-gray-600">We use the latest technology for accurate diagnosis and treatment.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Testimonials */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold text-gray-900">What Our Patients Say</h2>
            </div>
            <div className="mt-12 grid gap-8 lg:grid-cols-3">
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <p className="text-gray-600 italic">"The care I received at HealthCare was exceptional. The doctors were attentive and the staff was incredibly supportive."</p>
                <p className="mt-4 font-bold text-gray-800">- John Doe</p>
              </div>
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <p className="text-gray-600 italic">"A wonderful experience from start to finish. I highly recommend this hospital to everyone."</p>
                <p className="mt-4 font-bold text-gray-800">- Jane Smith</p>
              </div>
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <p className="text-gray-600 italic">"The facilities are top-notch and the medical team is truly world-class. My family felt safe and well-cared for."</p>
                <p className="mt-4 font-bold text-gray-800">- Michael Johnson</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4">HealthCare</h3>
            <p className="text-gray-400">Your health is our priority. Providing excellent medical services since 1990.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-400 hover:text-white">About Us</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">Services</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Contact Info</h3>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center"><MapPinIcon className="h-5 w-5 mr-2" /> 123 Health St, MedCity</li>
              <li className="flex items-center"><PhoneIcon className="h-5 w-5 mr-2" /> (123) 456-7890</li>
              <li className="flex items-center"><EnvelopeIcon className="h-5 w-5 mr-2" /> contact@healthcare.com</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Follow Us</h3>
            {/* Add social media icons here */}
          </div>
        </div>
        <div className="border-t border-gray-700 text-center py-4 text-gray-500">
          © {new Date().getFullYear()} HealthCare. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
};

export default Home;