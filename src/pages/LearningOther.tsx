import React from 'react';
import { Link } from 'react-router-dom'; // Import Link
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button'; // Import Button
import { ArrowLeft } from 'lucide-react'; // Import ArrowLeft

const LearningOther: React.FC = () => {
  return (
    <>
      <PageHeader
        title="Learning Experience: Other Resources"
        subtitle="A collection of various other learning materials and links"
      />
      <div className="container max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold mb-4">Other Learning Resources</h2>
        <p>Content for other learning resources will be added here soon.</p>
        {/* User will add specific content later */}

        {/* Add Back to Learning Resources button */}
        <div className="mt-12 text-center">
          <Link to="/tools/learning-resources">
            <Button variant="outline" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Learning Resources
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
};

export default LearningOther;
