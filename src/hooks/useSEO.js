import { useEffect } from 'react';

export default function useSEO({ title, description }) {
  useEffect(() => {
    if (title) {
      document.title = title;
    } else {
      document.title = 'Jiménez American Style | Ropa Americana Premium';
    }

    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.name = 'description';
        document.head.appendChild(metaDescription);
      }
      metaDescription.content = description;
    }
  }, [title, description]);
}
