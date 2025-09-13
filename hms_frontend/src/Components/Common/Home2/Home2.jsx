import React from 'react';
import { PhoneIcon, MapPinIcon, HeartIcon, UserGroupIcon, ShieldCheckIcon, BeakerIcon, StarIcon } from '@heroicons/react/24/solid';

// --- Reusable Sub-Components ---

const Header = () => (
  <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center py-4">
      <div className="text-3xl font-bold text-indigo-600">
        <a href="#">Vitalis</a>
      </div>
      <div className="hidden md:flex items-center space-x-10">
        <a href="#" className="text-gray-700 hover:text-indigo-600 font-semibold transition-colors duration-300">Home</a>
        <a href="#" className="text-gray-700 hover:text-indigo-600 font-semibold transition-colors duration-300">Services</a>
        <a href="#" className="text-gray-700 hover:text-indigo-600 font-semibold transition-colors duration-300">About Us</a>
        <a href="#" className="text-gray-700 hover:text-indigo-600 font-semibold transition-colors duration-300">Contact</a>
      </div>
      <a href="#" className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-full hover:bg-indigo-700 transition-all duration-300 transform hover:scale-105 shadow-lg">
        Book Now
      </a>
    </nav>
  </header>
);

const ServiceCard = ({ icon, title, description }) => (
  <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
    <div className="flex justify-center items-center h-16 w-16 bg-indigo-100 rounded-full mx-auto mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">{title}</h3>
    <p className="text-gray-600 text-center">{description}</p>
  </div>
);

const TestimonialCard = ({ quote, name, title, rating }) => (
    <div className="bg-white p-8 rounded-2xl shadow-lg relative">
        <svg className="absolute top-6 left-6 w-8 h-8 text-indigo-100" fill="currentColor" viewBox="0 0 32 32">
            <path d="M9.333 22.667h-6.667v-10h6.667v10zM29.333 12.667h-6.667v10h6.667v-10zM22.667 22.667h-6.667v-10h6.667v10zM29.333 22.667h-6.667v-10h6.667v10z"></path>
        </svg>
        <p className="relative text-gray-600 italic mb-6">"{quote}"</p>
        <div className="flex items-center">
            <div>
                <p className="font-bold text-gray-800">{name}</p>
                <p className="text-sm text-gray-500">{title}</p>
            </div>
            <div className="flex ml-auto">
                {Array(rating).fill().map((_, i) => (
                    <StarIcon key={i} className="h-5 w-5 text-yellow-400" />
                ))}
            </div>
        </div>
    </div>
);

// --- Main Home Component ---

const Home2 = () => {
  return (
    <div className="bg-slate-50">
      <Header />

      <main>
        {/* Section 1: Hero Section */}
        <section className="relative min-h-[85vh] flex items-center">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-fixed"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1581056771107-24a7f0338d82?q=80&w=1974&auto=format&fit=crop')" }}>
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent"></div>
          </div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
            <div className="max-w-xl">
              <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-tight">
                Compassionate Care, <br/> Exceptional Medicine.
              </h1>
              <p className="mt-6 text-lg text-slate-600">
                Welcome to Vitalis, where your health is our paramount concern. We combine state-of-the-art technology with a human touch to provide unparalleled medical care.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <a href="#" className="bg-indigo-600 text-white font-bold py-3 px-8 rounded-full hover:bg-indigo-700 transition-all duration-300 shadow-xl transform hover:scale-105">
                  Our Services
                </a>
                <a href="#" className="font-bold py-3 px-8 text-slate-700 hover:text-indigo-600 transition-all duration-300">
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Core Services */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-slate-900">Our Specialized Departments</h2>
              <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
                We provide world-class expertise in a wide range of medical fields.
              </p>
            </div>
            <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
              <ServiceCard 
                icon={<HeartIcon className="h-8 w-8 text-indigo-600" />}
                title="Cardiology"
                description="Expert care for heart health, from diagnostics to advanced treatment."
              />
              <ServiceCard 
                icon={<UserGroupIcon className="h-8 w-8 text-indigo-600" />}
                title="Pediatrics"
                description="Dedicated and gentle healthcare for your children's well-being."
              />
              <ServiceCard 
                icon={<ShieldCheckIcon className="h-8 w-8 text-indigo-600" />}
                title="Emergency Room"
                description="24/7 critical care services for urgent medical needs."
              />
              <ServiceCard 
                icon={<BeakerIcon className="h-8 w-8 text-indigo-600" />}
                title="Lab & Diagnostics"
                description="Accurate results with our advanced laboratory and imaging services."
              />
            </div>
          </div>
        </section>
        
        {/* Section 3: Why Choose Us */}
        <section className="py-24 bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center gap-16">
                <div className="lg:w-1/2">
                    <img src="https://images.unsplash.com/photo-1551601651-2a8555f1a136?q=80&w=2070&auto=format&fit=crop" alt="Doctor with patient" className="rounded-2xl shadow-2xl w-full" />
                </div>
                <div className="lg:w-1/2">
                    <h2 className="text-4xl font-extrabold text-slate-900">Your Health, Our Commitment</h2>
                    <p className="mt-4 text-lg text-slate-600">
                        At Vitalis, we don't just treat illnesses—we build relationships. Our patient-first philosophy ensures you feel heard, respected, and cared for at every step.
                    </p>
                    <ul className="mt-8 space-y-6">
                        <li className="flex items-start">
                            <ShieldCheckIcon className="h-7 w-7 text-indigo-600 flex-shrink-0 mr-4 mt-1" />
                            <div>
                                <h3 className="text-xl font-semibold">Board-Certified Experts</h3>
                                <p className="text-slate-600">Our physicians are leaders in their fields, dedicated to providing the highest standard of care.</p>
                            </div>
                        </li>
                        <li className="flex items-start">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-indigo-600 flex-shrink-0 mr-4 mt-1">
                                <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.5a.75.75 0 0 0 .5.707A9.735 9.735 0 0 0 6 21a9.707 9.707 0 0 0 5.25-1.533" />
                                <path d="M15 1.5A5.25 5.25 0 0 0 9.75 6.75v10.5A5.25 5.25 0 0 0 15 22.5a5.25 5.25 0 0 0 5.25-5.25V6.75A5.25 5.25 0 0 0 15 1.5zM15 18a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
                            </svg>
                            <div>
                                <h3 className="text-xl font-semibold">Advanced Technology</h3>
                                <p className="text-slate-600">We invest in cutting-edge medical technology for faster, more accurate diagnoses and treatments.</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </section>

        {/* Section 4: Testimonials */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-slate-900">Stories from Our Community</h2>
              <p className="mt-4 text-lg text-slate-600">Hear directly from the patients we've been privileged to serve.</p>
            </div>
            <div className="grid gap-10 lg:grid-cols-3">
              <TestimonialCard 
                quote="The level of care and personal attention I received was beyond my expectations. The entire team made me feel safe and supported."
                name="Sarah L."
                title="Cardiology Patient"
                rating={5}
              />
              <TestimonialCard 
                quote="Bringing our newborn here was the best decision. The pediatric staff are incredibly knowledgeable and compassionate."
                name="Michael and Jessica B."
                title="New Parents"
                rating={5}
              />
              <TestimonialCard 
                quote="I was in and out of the emergency room efficiently, and the doctors were thorough and reassuring. A truly first-class facility."
                name="David R."
                title="Emergency Patient"
                rating={5}
              />
            </div>
          </div>
        </section>

        {/* Section 5: CTA */}
        <section className="bg-indigo-700">
            <div className="max-w-7xl mx-auto text-center py-16 px-4 sm:px-6 lg:px-8">
                <h2 className="text-4xl font-extrabold text-white">Ready to Take the Next Step?</h2>
                <p className="mt-4 text-lg text-indigo-200">Your journey to better health starts here. Schedule your appointment today.</p>
                <a href="#" className="mt-8 inline-block bg-white text-indigo-600 font-bold py-3 px-8 rounded-full hover:bg-slate-100 transition-all duration-300 shadow-xl transform hover:scale-105">
                    Book an Appointment
                </a>
            </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">Vitalis</h3>
            <p className="text-slate-400">Committed to the health and well-being of our community.</p>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-4">Departments</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Cardiology</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Pediatrics</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Emergency</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-4">Contact</h3>
            <ul className="space-y-3 text-slate-400">
              <li className="flex items-center"><MapPinIcon className="h-5 w-5 mr-3" /> 123 Health Ave, MedCity</li>
              <li className="flex items-center"><PhoneIcon className="h-5 w-5 mr-3" /> (123) 456-7890</li>
            </ul>
          </div>
          <div>
            {/* Social media or other links can go here */}
          </div>
        </div>
        <div className="border-t border-slate-800 text-center py-6 text-slate-500">
          © {new Date().getFullYear()} Vitalis Medical Center. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
};

export default Home2;