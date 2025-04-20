import { Menu, Plus } from "lucide-react";

export default function Navbar() {
  return (
    <div className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4">
      {/* Left Side */}
      <div className="flex items-center space-x-4">
        <Menu className="w-6 h-6 text-black cursor-pointer" />
        <Plus className="w-6 h-6 text-black cursor-pointer" />
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-2">
        <img src="/Numa.png" alt="Logo" className="h-4.5 object-contain" />
        <img src="/NumaLogo.png" alt="Numa Logo" className="h-5 object-contain" />
      </div>
    </div>
  );
}
